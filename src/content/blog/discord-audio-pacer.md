---
title: "A 20 ms clock that can't drift: streaming audio to Discord in Go"
description: "How discord-audio-streamer turns ffmpeg output into a steady stream of Opus frames: absolute deadlines instead of sleeps, two opposite ring-buffer policies, holding audio until encryption is ready, and manufacturing silence for Windows."
published: 2026-10-01
tags: [go, audio, discord, concurrency]
repo: https://github.com/Lil-Strudel/discord-audio-streamer
---

[discord-audio-streamer](https://github.com/Lil-Strudel/discord-audio-streamer) is a small Windows desktop app that pushes audio into a Discord voice channel through your own bot. It has three modes: a **player** for a queue of files or YouTube links, a **streamer** that captures any audio device (your speakers included), and a **soundboard** that mixes four tracks at once. I built the soundboard because running audio for a tabletop game needs several sounds going at once.

It's about 13,700 lines of Go, with a [Wails](https://wails.io/) shell and a Svelte 5 UI. This post is about the Go side, specifically the unglamorous plumbing that decides whether audio sounds good or sounds _almost_ good.

## The pipeline

Discord voice wants Opus frames: 48 kHz stereo, one frame every 20 ms. A frame is 960 samples per channel, or 3,840 bytes of 16-bit PCM before encoding. Everything in the app exists to produce exactly one of those every 20 ms, forever, without hiccups:

```
ffmpeg ──► PCM frames ──► gain ──► ring buffer ──► Opus ──► Discord
```

ffmpeg only _decodes_; it never encodes. yt-dlp only _resolves_ a URL, and ffmpeg fetches the media itself, so seeking in a YouTube track is just an HTTP range request. Opus encoding happens in-process through cgo bindings to libopus, at 96 kbps by default with in-band forward error correction turned on.

The concurrency model is deliberately simple. A decoder goroutine writes PCM frames into a ring buffer. A single **pacer** goroutine reads, mixes, applies gain, encodes and sends. There's only one encoder goroutine because libopus encoder state isn't safe to share. Anything the UI changes, like volume or bitrate, crosses over through atomics, and bitrate changes are deferred until the encoder goroutine picks them up.

## Sleeping is how you drift

The library I use for Discord, [disgo](https://github.com/disgoorg/disgo), ships its own audio sender. It works out each frame's sleep as the _remainder_ of a 20 ms budget, using millisecond wall-clock arithmetic: do the work, measure how long it took, sleep for whatever's left.

That sounds right, but it has a subtle flaw. Sleeps always overshoot a little, since the scheduler wakes you _at least_ that late, never early. If each frame's sleep is computed from the previous wake-up, every overshoot is added to a running total. The stream slowly falls behind real time, and Discord's jitter buffer eventually has to deal with it.

The fix is to stop thinking in _durations_ and start thinking in _deadlines_. My pacer picks one anchor time and then derives every frame's deadline from it: frame _n_ is due at `anchor + n × 20ms`. If one frame wakes up 3 ms late, the next frame's deadline doesn't move, so it simply sleeps 3 ms less. Error gets absorbed instead of accumulated.

```go
anchor := time.Now()
var count int64

for {
	count++
	deadline := anchor.Add(time.Duration(count) * frameDuration)

	if delay := time.Until(deadline); delay > 0 {
		timer.Reset(delay)
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
	}

	lateness := time.Since(deadline)
	s.recordLateness(lateness)

	if lateness > maxLateness {
		s.resyncs.Add(1)
		anchor, count = time.Now(), 0
	}

	s.sendFrame()
}
```

Measured over 100 frames, the cumulative error is around **350 µs** against a 20 ms cadence, and it doesn't grow.

The `maxLateness` escape hatch matters more than it looks. If the loop falls more than three frames behind, it gives up on the schedule and re-anchors from now. Without that, a laptop waking from sleep would find itself hours behind and try to send hours of backlog as fast as it could, flooding the channel. From inside the loop, a suspend looks exactly like "very, very late".

The pacer also tracks how late each frame was, the worst lateness so far, and how many re-anchors there have been, and the UI shows those as a "stream health" readout. If something sounds wrong, the numbers say whether it's timing or the source.

## Don't send audio in the clear

Discord now supports end-to-end encryption for voice calls via its [DAVE protocol](https://daveprotocol.com/), and the app supports it through the `libdave` bindings. There's a subtle window, though. While the MLS handshake is in progress, after joining or moving channel, the DAVE session "encrypts" by passing frames through unchanged. Send audio during that window and it goes out unencrypted.

So the pacer keeps ticking but withholds frames until the session reports ready:

```go
if dave := s.conn.DAVE(); dave != nil && !dave.Ready() {
	s.framesHeld.Add(1)
	return
}
```

The clock keeps running during the handshake, so when encryption comes up the audio resumes on schedule instead of bunching up. Getting this hook meant pinning disgo to a commit from its main branch, which is a trade I'll happily make for not leaking audio.

## One ring buffer, two opposite policies

Between the decoder and the pacer sits a fixed-size ring of PCM frames. The interesting question is what happens when it fills up, and the answer is different for each source:

- **File playback can be throttled.** If the ring is full, the writer blocks. That back-pressures through the pipe and ffmpeg just waits, which is lossless and costs nothing.
- **Live capture can't.** If the writer blocks, the OS capture buffer overflows and the _driver_ drops samples, at an arbitrary point and without telling anyone. So the ring drops its _oldest_ frame instead. Latency stays bounded and every lost frame is counted.

Rather than two types, it's one `Ring` with the policy chosen at construction:

```go
// NewRing returns a Ring holding up to capacity frames. If dropOldest is true a
// full buffer discards its oldest frame to make room; otherwise writers block
// until space is available.
func NewRing(capacity int, dropOldest bool) *Ring {
```

Sizes are tuned per path: 10 frames (200 ms) for files, a configurable 3 to 15 frames for capture with 5 as the default, and 25 per soundboard voice.

## Volume without zipper noise

Two small things make the volume slider feel right.

First, loudness is perceived roughly logarithmically, so a linear slider feels dead at the bottom and useless at the top. Squaring the fraction spreads the useful range across the slider's travel:

```go
func amplitudeFor(percent float64) float64 {
	percent = math.Max(0, math.Min(MaxVolumePercent, percent))
	frac := percent / 100
	return frac * frac
}
```

Second, applying a new gain instantly to a frame produces the "zipper noise" you hear when dragging a slider. Each frame instead ramps linearly from the previous gain to the new one. Amplified samples **saturate** rather than wrap, because an int16 that overflows doesn't clip, it flips sign, and that sounds like a gunshot. On the soundboard, a sound that gets replaced gets one last frame faded to silence so it doesn't click.

## Windows doesn't send silence

The streamer mode captures speaker output on Windows using WASAPI loopback, written in pure Go against the COM interfaces, with no cgo. It has one property that surprised me: a render endpoint that's playing nothing produces **no packets at all**. Not silent packets, _no_ packets.

To the pipeline, that looks like the source has died. The ring runs dry, the underrun counter climbs, and the stream-health readout claims the stream is failing every time the music stops. So the capture loop keeps its own count of how many sample-frames it _should_ have produced since it started, and when the endpoint has gone quiet it manufactures the missing silence itself:

```go
if time.Since(lastPacket) > idleGap {
	want := int64(time.Since(epoch).Seconds() * outSampleRate)
	if gap := want - produced; gap > 0 {
		out = append(out, Silence(int(gap))...)
		produced = want
	}
}
```

It's the same idea as the pacer: compare against an absolute clock rather than trusting what arrived last.

Endpoints running at 44.1 kHz get resampled to 48 kHz on the way in. At the other end of a track the pacer sends five frames of trailing silence, because Discord uses them to reset its decoder's interpolation. Without them, the tail of one track can smear into the start of the next.

## What I'd tell past me

Real-time audio is mostly about _time_, not _audio_. Nearly every bug in this project was a clock disagreement: a sleep that overshot, a buffer that blocked at the wrong moment, an endpoint that stopped talking, a counter that kept "detecting underruns" fifty times a second after a file had finished. The fixes all had the same shape: pick one authoritative clock and measure everything against it.

The other half of the story is getting a cgo app with an MSVC-built DLL to survive on Windows, which turned out to involve two C runtimes and one very confused `free()`. That got [its own post](/blog/cgo-two-heaps).
