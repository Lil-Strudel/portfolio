---
title: "Scale-to-zero Minecraft on Kubernetes, and the backups that silently weren't"
description: "Running a fleet of Minecraft servers on six small nodes means idle ones have to cost nothing. Getting there meant fighting Flux over one field and discovering Velero had been backing up nothing at all."
published: 2026-10-02
tags: [kubernetes, flux, velero, homelab]
repo: https://github.com/Lil-Strudel/homelab
---

My [homelab](/blog/homelab) runs a small fleet of Minecraft servers: two survival worlds and a Cobblemon modpack. Java Minecraft servers are memory-hungry, my nodes are OptiPlex Micros, and most of the time nobody is playing. So the servers have to go to sleep when they're empty and wake up when someone connects, without anyone noticing.

That took three decisions, and each one fixed a problem that wasn't obvious until it bit.

## Pausing isn't sleeping

The popular [`itzg/minecraft-server`](https://github.com/itzg/docker-minecraft-server) image has two built-in idle features, and neither solves this:

- `ENABLE_AUTOPAUSE` sends the JVM a `SIGSTOP`. CPU drops to zero, but **the heap is still resident**. Three paused servers hold exactly as much RAM as three busy ones, which was the whole problem.
- `ENABLE_AUTOSTOP` stops the server, the container exits, and Kubernetes restarts it, which is a long way to go to stand still.

Both leave the pod scheduled. The only thing that gives memory back is `replicas: 0`. And the only component that knows whether anyone is connected is the proxy that every connection already passes through.

So [mc-router](https://github.com/itzg/mc-router) owns both halves. It wakes a server when a player knocks and puts it back to sleep after ten idle minutes, and it shows a helpful MOTD in the server list while it does:

```yaml
args:
  - --in-kube-cluster
  - --kube-namespace=minecraft
  - --auto-scale-up
  - --auto-scale-down
  - --auto-scale-down-after=10m
  - --auto-scale-asleep-motd=§7Asleep — §aconnect to wake it up
  - --auto-scale-loading-motd=§6Waking up… §7give it a moment
```

The image's own pause and stop features stay off. A nice side effect is that capacity planning is now one metric: `kube_statefulset_status_replicas` tells me exactly what's awake.

## The field that can't be in the manifest

Here's the trap. Flux reconciles with **server-side apply**, and server-side apply tracks field ownership. Every field your manifest declares is a field Flux owns.

So if the StatefulSet declares `replicas`, two controllers own the same number. A player connects, mc-router patches `replicas` to 1, and the server starts booting. Then Flux's next reconcile comes along and sets it back to 0, disconnecting whoever just joined. It happens on an interval, so it looks exactly like a flaky network.

The fix is to leave `spec.replicas` out of every Minecraft StatefulSet entirely. If Flux never declared it, Flux doesn't own it, and mc-router's patches stand. The cost is small and worth knowing: on create, the API server defaults `replicas` to 1, so a brand-new server boots once and falls asleep ten minutes later.

The really nasty part is that you can't fix this by adding the field and later removing it. With server-side apply, **removing a field you own doesn't release it, it deletes it**, resetting the value once on the way out. So the field never goes in, and a decision record says so in bold for the next time I'm tempted.

## The backup that reported success and saved nothing

Everything else in the cluster is backed up by Velero, on daily, weekly and monthly schedules, using Kopia file-system backup. I'd assumed the Minecraft worlds were covered too. They weren't, for two separate reasons.

**First, Velero finds volumes through running pods.** File-system backup walks the pods and backs up the volumes they mount. A sleeping server has no pod, so its world isn't skipped with a warning; it simply isn't seen. These servers are asleep most of the time, and certainly at 2 a.m. when the daily schedule fires. And nothing reports an error, because a namespace with no pods isn't a failure.

**Second, nothing quiesced the server.** Even when a server happened to be awake, Velero copied the region files while the JVM was writing them. That doesn't produce a backup; it produces a torn world. Minecraft has a documented way to hold a world still (`save-off`, `save-all`, copy, `save-on`), and any backup that skips it is an inconsistent snapshot no matter what moves the bytes.

So the `minecraft` namespace is excluded from Velero, and each server runs [`itzg/mc-backup`](https://github.com/itzg/docker-mc-backup) as a **sidecar** that talks to the server over RCON and does the save dance properly before running restic.

Putting the backup inside the pod turns scale-to-zero from an obstacle into the schedule. The sidecar exists exactly when the world can change. A server nobody visits makes no snapshots, because it has nothing new to say. Each server has its own restic repository, so two servers waking at once never fight over a lock.

## The general lesson

> A backup system that discovers work through running pods silently under-covers anything that scales to zero.

That's now written in the decision record, with a note to recheck it the day any other workload here learns to sleep. A backup that _runs_ isn't the same as a backup that _restores_, and the only way to know the difference is to think about what the tool can actually see.
