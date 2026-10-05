---
title: "Two heaps, one free(): shipping a cgo app on Windows"
description: "The first release of discord-audio-streamer died on startup. The second died the moment it joined a voice channel. Both were about which C runtime the Go binary was linked against, and CI now checks it on every build."
published: 2026-09-30
tags: [go, cgo, windows, ci]
repo: https://github.com/Lil-Strudel/discord-audio-streamer
---

Pure Go cross-compiles beautifully. You set `GOOS=windows`, get one static `.exe` and go home. [discord-audio-streamer](/blog/discord-audio-pacer) isn't pure Go. It uses cgo for two C libraries: **libopus** for encoding, and **libdave**, Discord's end-to-end encryption library, which Discord only ships as a prebuilt DLL.

My development machine runs Linux, the app ships for Windows, and the gap between "works on my machine" and "works on yours" turned out to be about C runtimes.

## Release one: the missing DLL

The very first tagged release died on startup on a clean Windows machine:

```
libopus-0.dll was not found
```

The Windows build runs in GitHub Actions under MSYS2, and its toolchain had happily linked libopus _dynamically_, because the import library `libopus.dll.a` was sitting next to the static archive `libopus.a`. Nothing copied the DLL into the release zip, and on my machine it was always on the path.

The fix has two parts. First, prefer static linking by making dynamic linking impossible: if the static archive exists, CI deletes the import library so `-lopus` can only resolve to `libopus.a`.

```bash
if [ -f /ucrt64/lib/libopus.a ]; then
    rm -f /ucrt64/lib/libopus.dll.a
    echo "-> libopus will be linked statically"
fi
```

Second, stop trusting myself to know what the exe needs. A script walks the import tables of everything in the release, copies in any DLL it finds in the toolchain's `bin`, and **fails the build** if a dependency is neither bundled, part of Windows, nor an API set. libdave stays dynamic, since a DLL is all Discord provides, and ships next to the exe.

## Release two: the crash on join

With the DLLs sorted, the app started. Then it crashed, but only when it joined a voice channel. That's exactly when the DAVE encryption handshake runs.

The cause is a classic Windows trap. On Linux there's one C library per process, and every `malloc` and `free` uses the same heap. On Windows, **each C runtime has its own heap**, and a process can contain several runtimes at once.

- `libdave.dll` is built by Discord with MSVC, against the modern **Universal C Runtime** (UCRT).
- Its header asks callers to release the byte arrays it returns with `free()`, and the Go bindings dutifully do that on every handshake.
- My build used MSYS2's **MINGW64** environment, whose `free()` comes from the legacy `msvcrt.dll`.

So memory allocated by the UCRT's heap was being released into `msvcrt.dll`'s heap. That's undefined behavior that happens to show up as heap corruption, and the process died on the spot.

The fix is to build in MSYS2's **UCRT64** environment instead, which links against the same universal CRT that libdave was built with. One `malloc`, one `free`, one heap.

## Making it impossible to regress

The worst thing about this bug is how quietly it could come back. Someone (me) tweaks the CI setup, the toolchain slips back to MINGW64, everything compiles, and every user crashes on their first join.

So CI checks the _artifact_, not the configuration. After building, it inspects the exe's import table and fails if the legacy runtime appears:

```bash
# libdave hands back memory the caller has to free(), so the exe must
# use the same C runtime libdave was built against. Importing the
# legacy msvcrt.dll means the toolchain slipped back to MINGW64 and
# every DAVE handshake would corrupt the heap.
if objdump -p "$EXE" | grep -qi 'DLL Name: msvcrt.dll'; then
    echo "Error: the executable links the legacy msvcrt.dll." >&2
    exit 1
fi
```

That's one of my favorite kinds of check: it encodes _why_ in the error message, and it tests the thing that ships rather than the thing I think I configured.

## Shipping ffmpeg and yt-dlp inside the exe

The app also depends on two external programs: ffmpeg for decoding and yt-dlp for resolving links. I didn't want anyone to have to install anything, so release builds embed both, gzipped, inside the executable with `//go:embed`.

Neither can run from memory; they have to be real processes. So on first use they're unpacked into the user's cache directory, and the filename includes a hash of the contents:

```go
sum := sha256.Sum256(payload)
filename := name + "-" + hex.EncodeToString(sum[:8])
```

That gives two things for free. An app update installs its own copy of ffmpeg instead of silently reusing last release's, and an existing file of the right size is reused rather than rewritten on every launch.

There's a neat Go detail in where this code lives. The `//go:embed` directives only compile under release build tags (`embedffmpeg`, `embedytdlp`), so an ordinary build never needs the assets present. If the unpacking logic sat next to them, `go vet` and `go test` would never see it, and the atomic-rename handling would go untested until it misbehaved on someone else's machine. So the logic lives in its own package, `embedbin`, with no build tag, and each tagged file is a tiny wrapper that hands it an `embed.FS` (trimmed slightly here):

```go
//go:build embedffmpeg

//go:embed assets/ffmpeg.gz
var embeddedFFmpeg embed.FS

func resolve() (string, error) {
	return embedbin.Unpack(embeddedFFmpeg, "assets/ffmpeg.gz", "ffmpeg")
}
```

## Where cgo isn't needed

The streamer mode captures speaker audio through WASAPI loopback, and that part has **no cgo at all**. It's pure Go, calling straight into COM vtables with `syscall.SyscallN` and `golang.org/x/sys/windows`. The fewer C runtimes involved, the fewer heaps there are to confuse, and the Linux CI job can still run `go vet` and `go test -race` across most of the codebase.

## Takeaways

- **On Windows, memory belongs to a C runtime, not to the process.** If a DLL hands you memory to `free()`, you need to be on its runtime. Check what it was built with.
- **Test the artifact.** `objdump -p` on the final exe catches a whole class of toolchain drift that no amount of reading YAML will.
- **Fail the build on unknown dependencies.** An allow-list of "bundled, part of Windows, or an API set" turns a runtime crash on a user's machine into a red CI job on mine.
- **Keep untagged code testable.** Anything behind a build tag is invisible to `go test` unless you deliberately move the logic out.

The release job now produces a single portable zip with the exe and `libdave.dll` side by side. Unzip it and run it, with nothing else to install.
