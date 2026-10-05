---
title: "Six OptiPlexes, zero kubeadm: a tour of my homelab"
description: "Talos Linux, Cilium speaking BGP to a MikroTik, Rook-Ceph on NVMe and Flux holding it all together. Three years, 256 commits, and at least three commits titled 'fix: again?'."
published: 2026-10-04
tags: [kubernetes, homelab, talos, ceph, gitops]
repo: https://github.com/Lil-Strudel/homelab
---

My homelab repo's first real commit is from November 2023: `feat: terraform now manages my mikrotik router`. Three years and 256 commits later it runs a six-node Kubernetes cluster, a replicated storage system, a GitOps pipeline, an observability stack and a small fleet of Minecraft servers that go to sleep when nobody's playing.

This is the tour. A few of the war stories are big enough for their own posts, so I've linked those as we go.

## The hardware

Everything lives in a small rack, and everything is boring on purpose: used Dell OptiPlex Micros are cheap, quiet, and identical enough that I can treat them as cattle.

| Role          | Machines                 | Disks                               | Network                        |
| ------------- | ------------------------ | ----------------------------------- | ------------------------------ |
| Control plane | 3× OptiPlex Micro 7070   | 250 GB SATA (OS) + 1 TB NVMe (Ceph) | 10 GbE M.2 NIC                 |
| Workers       | 3× OptiPlex Micro 7080   | 250 GB SATA (OS) + 1 TB NVMe (Ceph) | 10 GbE M.2 NIC                 |
| Routing       | MikroTik CCR2004         |                                     | BGP peer for the whole cluster |
| Switching     | MikroTik CRS326 + CRS312 |                                     | the CRS312 is the 10 G core    |

There's also a Dell R730xd NAS sitting outside the cluster with ZFS, a PiKVM for when I lock myself out, and a UPS for when the power company does.

Every node has the same split: a small SATA SSD for the OS and a 1 TB NVMe that belongs entirely to Ceph. That split shows up again in a minute.

## Talos: an OS you can't SSH into

The nodes run [Talos Linux](https://www.talos.dev/) with Secure Boot. Talos has no shell and no SSH, and you can't log in to fix things by hand. The whole machine is one declarative config, changed through an API. After years of snowflake servers, that's the feature.

There's no kubeadm either. Talos bootstraps Kubernetes itself, and my patch mostly turns things _off_:

```yaml
cluster:
  network:
    cni:
      name: none # Cilium is the CNI — do NOT re-enable, it would double-install and break the network
  proxy:
    disabled: true # Cilium is the kube-proxy replacement — do NOT re-enable
```

Those comments are shouty for a reason. I've broken the cluster's networking exactly that way before.

The install disk is chosen with `diskSelector.model` rather than a device path, so Talos always lands on the SATA SSD and never touches the NVMe Ceph is waiting for. Device names like `/dev/sda` are not stable across boots on these machines. Model strings are.

## Networking: BGP all the way down

This is the part I'm proudest of, and the part that's caused the most pain.

There's no MetalLB and no ARP tricks. Every routable address in the cluster is announced to the MikroTik over BGP:

- **The Kubernetes API** sits behind a virtual IP that [kube-vip](https://kube-vip.io/) announces from the three control-plane nodes. The VIP lives on the loopback interface as a `/32` with ARP turned off, so BGP is its _only_ path onto the network.
- **LoadBalancer services** get addresses from a Cilium IP pool, and Cilium's BGP control plane announces them from the three workers only. Keeping the two speakers on different nodes means they never fight over the same router session.

The service pool isn't a VLAN at all. It doesn't exist on any wire; it's just a range that shows up in the router's table as a pile of `/32` routes:

```yaml
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata:
  name: services-pool
spec:
  blocks:
    - start: 10.0.65.1
      stop: 10.0.65.254
```

(I've changed the addresses; the shape is real.)

Cilium is doing a lot of jobs here: it's the CNI, the kube-proxy replacement, the ingress controller and the BGP speaker for services. One component and one set of CRDs makes it a single thing to understand when it breaks.

It has broken. The control-plane VIP spent a while dropping off the network on a precise 37-second loop, and the cause was a three-way disagreement about BGP keepalive timers, with a Terraform provider bug on top. That got [its own post](/blog/bgp-hold-timers).

## Terraform runs the network

Kubernetes is downstream of the network, so the network is managed separately, in Terraform, with the [`terraform-routeros`](https://github.com/terraform-routeros/terraform-provider-routeros) provider. There's one provider alias per MikroTik device, talking to the RouterOS HTTPS API. Terraform owns the VLANs, switch ports, DHCP, firewall, BGP peers and WiFi, plus the AWS side: Route53 records, a couple of IAM users and the S3 buckets for backups.

My favorite bit of the Terraform is a single `local.services` map. It's simultaneously the IP allocation record for every LoadBalancer service _and_ the switch for whether that service is exposed to the internet. One place to look, and one diff to review when something changes. Right now every service is set to `expose = null`.

DNS is split-horizon: internal records live on the MikroTik, public ones in Route53, and Terraform writes both. cert-manager gets Let's Encrypt certificates over DNS-01 against Route53, so even services that will never see the internet get real TLS.

## Storage: Rook-Ceph on six NVMe drives

Persistent storage is [Rook](https://rook.io/) running Ceph v20 "Tentacle": six OSDs, one per node's NVMe, with 3× replication and `host` as the failure domain. Any single machine can die and nothing is lost. The OSDs tolerate the control-plane taint, so all six nodes contribute disks, not just the workers.

Out of that I get three storage classes:

- `ceph-block`: RBD volumes, the cluster default
- `ceph-filesystem`: CephFS for the rare `ReadWriteMany`
- an S3-compatible object store via RGW, whose data pool is **erasure-coded 2+1**. That stores 1.5× instead of 3×, which is why bulky, re-derivable data like Loki's log chunks lives there.

The most useful thing I did to the Rook config this year was _delete_ most of it. When I rebuilt in July, the Helm values files went from 701 and 774 lines down to 40 and 145. The rule became: **only genuine divergences from the chart default and deliberate pins appear in `values:`**, and each one is documented with a reason.

That audit found a real bug. My old values re-specified the block pool and filesystem StorageClasses "for clarity", and in doing so silently dropped the `csi.storage.k8s.io/*-secret-*` parameters the chart's defaults include. Helm replaces lists wholesale; it doesn't merge them. A partial restatement of a default isn't documentation, it's a fork.

Renovate keeps all of this current, which once nearly ended badly. It tried to upgrade Ceph to `v21.1.0`, which is a _release candidate_ in Ceph's numbering (`x.0` is dev, `x.1` is RC, `x.2` is stable), and which Rook v1.20 refuses to run at all. The fix is a version bound in `renovate.json`:

```json
{
  "matchPackageNames": ["quay.io/ceph/ceph"],
  "allowedVersions": "/^v20\\./"
}
```

Raising that bound is now a deliberate step, taken only after a Rook release supports the next Ceph major.

## GitOps: Flux, in layers

Everything in the cluster is reconciled by [Flux](https://fluxcd.io/) from the repo. The interesting part is the dependency chain:

```
core-controllers → core-configs → platform-controllers → platform-configs → apps
                                                                          ↘ minecraft
```

Each layer `dependsOn` the previous one with `wait: true`, so Flux won't apply a `CiliumBGPClusterConfig` until Cilium's CRDs exist, and nothing in `apps` starts until the platform underneath it is healthy. Controllers and their configs are split because CRDs have to exist before anything can use them.

The one exception is the Minecraft layer, and its manifest explains why better than I can:

```yaml
wait: false # a cold modpack download outlasts any sane timeout; readiness is not a gate here
```

Two Flux lessons I learned the hard way:

1. **Flux dry-runs a whole layer at once.** One manifest with a kind the API server doesn't recognize yet blocks the _entire_ layer, not just that resource. That's the real reason the controller/config split exists.
2. **Renaming a Kustomization prunes everything it owns.** Flux sees the old one disappear and garbage-collects its resources. Set `deletionPolicy: Orphan` _before_ the rename, or enjoy watching your apps get deleted.

Secrets are SOPS-encrypted with Age, with two recipients: me and the cluster. Only `data` and `stringData` are encrypted, so diffs stay readable. Terraform reads the same files through the `carlpett/sops` provider. I tried HashiCorp Vault and Teleport in late 2025 and removed both this July. They were great software and far too much of it for one person.

## What actually runs on it

- **Vaultwarden** for passwords, **Immich** for photos and **Shlink** for short links, each with its own [CloudNativePG](https://cloudnative-pg.io/) Postgres cluster backed up to S3. (They all started on SQLite. Vaultwarden's Alpine image segfaults against Postgres thanks to musl, so it runs the Debian image.)
- **Factorio**, and a **Minecraft** fleet behind mc-router that scales each server to zero when it's empty. Getting that to coexist with Flux and Velero was subtle enough for [a post of its own](/blog/minecraft-scale-to-zero).
- **Observability**: the VictoriaMetrics stack, Loki and Grafana, with Grafana Alloy shipping logs, including syslog from the router. (Once 88% of that syslog turned out to be a single upstream ISP device advertising a jumbo MTU about once every two seconds. I decoded the vendor from its EUI-64 link-local address, then told Alloy to drop the line.)
- **Velero** backs up everything else to S3 on daily, weekly and monthly schedules, into a versioned bucket that tiers to Glacier.

Every namespace starts from a default-deny `CiliumNetworkPolicy` with FQDN-based egress allow-lists, and runs under the `restricted` Pod Security Admission profile. Nothing here is on the public internet yet, but I'd like the day it is to be boring.

## The commit log is the real documentation

The early history of this repo is a fairly honest record of learning Kubernetes on bare metal:

```
2024-09-22  feat: HA kubernetes setup with cilium and kube-vip!!!
2024-10-27  fix: i hope?
2024-10-27  fix: again?
2024-10-27  fix: again?
2024-10-27  fix: again?
2024-11-10  screw helm
2024-11-10  cluster is back
2024-11-10  rook broken. removing
2025-11-10  test: success!!!
2026-07-15  feat: remove everything not cilium/flux from the cluster
```

That July commit was the turning point. Instead of patching, I tore the cluster down to Cilium and Flux, then rebuilt each layer with a written decision record explaining every non-default choice. The repo now has a `docs/` site with decision records on BGP timers, Rook values, the layering and the Minecraft setup. Writing down _why_ turned out to be the difference between a cluster I'm scared to touch and one I can upgrade on a Monday morning when Renovate opens its PRs.

If you're building something similar, my advice is the same thing the decision records keep saying: set only what you mean, write down why, and let the defaults be defaults.
