---
title: "The 37-second loop: kube-vip, RouterOS and a BGP timer nobody set"
description: "My Kubernetes API VIP kept vanishing from the network on a perfectly regular schedule. The cause was three BGP speakers with three different opinions about keepalives, and the fix turned up a Terraform provider bug."
published: 2026-10-03
tags: [kubernetes, bgp, networking, terraform, homelab]
repo: https://github.com/Lil-Strudel/homelab
---

Some bugs are random. This one had a metronome.

The Kubernetes API in [my homelab](/blog/homelab) sits behind a virtual IP that kube-vip announces over BGP from the three control-plane nodes. Every so often `kubectl` would hang, then recover. The router's logs showed the BGP sessions from the control-plane nodes going down and coming back up roughly every **37 seconds**, all day.

## The setup

There are three BGP speakers peering with one MikroTik router:

- **kube-vip** on the three control-plane nodes, announcing the API VIP
- **Cilium** on the three workers, announcing LoadBalancer service IPs
- **RouterOS** on the router, with six peer connections

The VIP is configured the strict way. It's a `/32` on the loopback interface with `vip_arp=false`, so there is no gratuitous ARP and no layer-2 fallback. BGP is the _only_ way the network learns where the API lives. That's a lovely clean design right up until BGP is the thing that's broken.

The odd detail was that Cilium's sessions to the _same router_ were rock solid. Only kube-vip's flapped.

## How BGP decides a peer is dead

Every BGP session has a **hold time**. If a speaker hears nothing from its peer for that long, no update and no keepalive, it declares the peer dead and tears the session down. To stop that happening, each side sends **keepalives** on an interval, conventionally a third of the hold time so that two can be lost without consequence.

The detail that matters: the hold time is **negotiated**, and the session uses the _lower_ of the two configured values. But each side still sends keepalives on its _own_ interval. Nothing forces the two to agree.

Here's what each speaker does out of the box:

| Speaker  | Default hold | Default keepalive |
| -------- | ------------ | ----------------- |
| kube-vip | 30 s         | 10 s              |
| Cilium   | 90 s         | 30 s              |
| RouterOS | 3 m          | 3 m               |

Put kube-vip and RouterOS together and the negotiated hold time is 30 seconds. kube-vip will declare the router dead if it hears nothing for 30 seconds. The router, meanwhile, sends a keepalive every _three minutes_.

So the router sends its burst of messages when the session comes up, then goes quiet. Thirty seconds later kube-vip's hold timer expires, it tears the session down, and reconnecting plus re-establishing takes a few more seconds. Then it happens again. That's the 37-second loop.

Meanwhile Cilium's sessions, negotiating from a 90-second hold instead of 30, stayed up against the very same router. Same peer, different defaults, completely different behavior.

And because the VIP has no layer-2 fallback, every time a kube-vip speaker's session dropped, its route to the API went with it. When the three speakers' flaps happened to line up, the route left the router's table entirely and `kubectl` hung.

## The fix, and the flags that get thrown away

The fix is to make every speaker agree: **90-second hold, 30-second keepalive**, on both ends of every session. That pair satisfies every combination in the table above, and it's what Cilium already does by default.

kube-vip has flags for exactly this, `--bgpHoldTimer` and `--bgpKeepAliveInterval`. I generate kube-vip's manifest with its own generator to keep it close to upstream, so I added the flags there.

The generator accepted both flags, printed no warning, and emitted a manifest without them.

It turns out kube-vip's manifest generator parses those flags and then silently discards them; it never writes a corresponding `env` entry. So my generation pipeline has a second documented `sed` fixup that appends them to the container `args` directly:

```yaml
- args:
    - manager
    - --bgpHoldTimer=90 # 30s default outruns RouterOS's keepalive timer — session drops every 30s
    - --bgpKeepAliveInterval=30
```

The lesson I keep relearning: **verify the effect, not the config.** The router is the authority on what was actually negotiated:

```
/routing/bgp/session/print where name~"Makima"
```

`hold-time` should read `1m30s`, not `30s`. A healthy session's uptime climbs without resetting, and the router's sent-messages counter ticks up roughly every 30 seconds. That counter is the real evidence, because a BGP session can look established right up until the moment it's torn down.

## Then Terraform got involved

The router side of the fix is `hold-time=1m30s` and `keepalive-time=30s` on each of the six BGP connections. My network is managed in Terraform with the `terraform-routeros` provider, so naturally I added two attributes to the resource and ran a plan.

The plan was clean: six ordinary in-place updates. The apply failed on all six:

```
400 Bad Request, details: 'unknown parameter add-path-out'
```

I hadn't touched add-path at all. The provider _reads_ the peer's add-path setting from the API as `output.add-path`, but _writes_ it back as `add-path-out`, which RouterOS rejects. That breaks both update and create, so the resource can be read but never written.

This bug had been sitting there for months, invisible, because these BGP connections were adopted into Terraform with `terraform import`. Terraform had simply never needed to write one.

It gets worse with `-replace`. Terraform destroys the connection first, which succeeds, and then fails to create it. That leaves you with a deleted BGP peer that Terraform can't recreate. Rebuilding one by hand has its own traps: `instance` is mandatory (`missing =instance=`), and `router-id` must be _omitted_ because RouterOS 7.20+ rejects it as unknown.

So the timers are the one thing on the router that Terraform deliberately doesn't manage. The resource doesn't declare `hold_time` or `keepalive_time`, and a decision record explains why the repo and the device knowingly disagree on these two fields. It also says how to close the gap later: when a provider release fixes the write path, bump the pin, add both attributes, and confirm the plan is a **no-op**. The device already holds the right values, so an empty plan is the proof the drift is gone.

## What I took away

- **Defaults are a protocol between strangers.** Three BGP implementations, three sensible defaults, and a combination that fails every 37 seconds. If two systems have to agree on a value, set it explicitly on both ends.
- **Generators can lie by omission.** A tool that accepts a flag and does nothing with it is worse than one that errors. Diff generated output against your intent.
- **`terraform import` can hide a broken write path for a long time.** A resource you've only ever read isn't proof the provider can write it.
- **Write down knowing drift.** "Terraform doesn't manage this, on purpose, and here's the bug" is far better than a mysterious hand-edit someone "fixes" later.
