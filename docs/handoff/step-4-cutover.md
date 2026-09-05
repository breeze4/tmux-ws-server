# Step 4 handoff: host runtime cutover

The Admin commit `1f062549d89c23058165bc622e3f27c530a91515` deployed through the host runtime. The manual command reported `deployed`.

`active.env` contains:

```text
COMMIT_SHA=1f062549d89c23058165bc622e3f27c530a91515
SOURCE=source
```

BeeBaby rebooted at `2026-09-05T10:38:29-07:00`. The unit started in the new boot at `2026-09-05T10:39:12-07:00`, and the health endpoint returned `200`.

The fresh browser verifier confirmed a host shell, the Claude CLI path, and the deployed commit. It saved screenshots in `screenshots/admin/`.
