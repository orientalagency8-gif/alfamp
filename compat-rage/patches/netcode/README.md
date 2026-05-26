# Netcode patches

These `.patch` files apply on top of `citizenfx/fivem` at our pinned upstream sha
in `alfamp-client`. They produce `AlfaMP.exe` and `AlfaServer` with our
networking improvements over stock CFX.

**Read [`docs/NETCODE.md`](../../../docs/NETCODE.md) first** for the engineering
rationale, target metrics, and per-patch design notes.

## Apply order

Patches are applied alphabetically (the build pipeline does
`for p in patches/*.patch; git apply $p`). The numbering enforces order:

| # | Patch | Phase | Status |
|---|-------|-------|--------|
| 00 | `00-rebrand.patch` | Stage-2 | ⚪ TODO |
| 01 | `01-60hz-tickrate.patch` | Phase 1 | 🔴 skeleton |
| 02 | `02-extended-vehicle-snapshot.patch` | Phase 1 | 🔴 skeleton |
| 03 | `03-soft-reconciliation.patch` | Phase 1 | 🔴 skeleton |
| 04 | `04-adaptive-priority.patch` | Phase 1 | 🔴 skeleton |
| 10 | `10-state-auth-vehicle.patch` | Phase 2 | 🔴 skeleton |
| 11 | `11-driver-handoff.patch` | Phase 2 | 🔴 skeleton |
| 12 | `12-server-rewind.patch` | Phase 2 | 🔴 skeleton |
| 13 | `13-collision-arbitration.patch` | Phase 2 | 🔴 skeleton |
| 20 | `20-hot-reload.patch` | Phase 3 | 🔴 skeleton |
| 21 | `21-telemetry-sentry.patch` | Phase 3 | 🔴 skeleton |

## Authoring a patch

We diff against upstream master at the sha pinned by `alfamp-client`. To author:

```bash
# Locally clone upstream pinned at our sha (see UPSTREAM_PIN in alfamp-client)
git clone https://github.com/citizenfx/fivem.git
cd fivem && git checkout <UPSTREAM_PIN>

# Make your changes
vim code/components/citizen-server-impl/src/state/ServerGameState.cpp

# Produce patch
git diff > /path/to/alfamp/compat-rage/patches/netcode/XX-your-patch.patch

# Test apply
cd /tmp && git clone https://github.com/citizenfx/fivem.git test-apply
cd test-apply && git checkout <UPSTREAM_PIN>
git apply --check /path/to/your.patch
```

## Build pipeline picks them up

The `alfamp-client` repo's `.github/workflows/build-client.yml` already does:

```yaml
- name: Apply AlfaMP patches
  shell: bash
  run: |
    PATCH_DIR="$GITHUB_WORKSPACE/overlay/patches"
    if [ -d "$PATCH_DIR" ] && ls "$PATCH_DIR"/*.patch >/dev/null 2>&1; then
      cd /c/b/fivem
      for p in "$PATCH_DIR"/*.patch; do
        git apply --3way --verbose "$p"
      done
    fi
```

So the moment we copy these files into `alfamp-client/patches/netcode/`, the
next build picks them up. (Currently they live here in the monorepo so they're
versioned alongside the architecture doc.)
