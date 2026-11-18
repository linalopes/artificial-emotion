# 0.3.10 autonomy baseline (rollback)

Fleet was OTAd to **0.3.11** on 2026-11-18 (`diagnostics/2026-11-18-fleet-ota-0.3.11/`).

Rollback if physical acceptance fails: re-OTA the **0.3.10** artifact  
(`diagnostics/2026-11-18-fleet-ota-0.3.10/firmware-0.3.10.sha256` = `8513d571…`).

Host policy for mute-during-autonomy remains `shouldDeferWsIoV0310` / `networkIsolated=false`.
