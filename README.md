# BumbleBee — Smart Beehive Monitoring System

An AIoT (AI + IoT) system for non-invasive, real-time monitoring of honeybee hives, built by **Group 3** for the **22ECE – System IoT Design** course at The University of Da Nang – University of Science and Technology, Faculty of Advanced Science and Technology.

BumbleBee also began as an earlier student research (NCKH) project — this repository tracks both the original prototype materials and the current course deliverable.

## Team

- Phan Nữ Kiều Hạnh (Leader)
- Đoàn Minh Hiếu
- Đỗ Lâm Khánh
- Nguyễn Minh Hoàng

## What it does

A sensor node sits under a beehive and measures temperature, humidity, weight (4 load cells), GPS location, and hive sound — without ever opening the hive. An on-device edge-AI model classifies queen presence/absence from audio. Data is pushed over 4G to a Firebase backend and shown on a real-time web dashboard, with predictive alerts for disease risk, absconding, swarming, theft, and harvest timing.

See the full architecture diagram in [`Buildingblock/1.png`](Buildingblock/1.png) and the layered component breakdown in [`Buildingblock/2.png`](Buildingblock/2.png).

## Repository layout

| Path | Contents |
|---|---|
| `22ECE_SystemIOTDesign_Group3_Report (1).pdf` | Course project log book / report (PDF export) |
| `Bumblebee/IOTSystem/Report/` | Course project report (`.docx`, fuller/authoritative version) |
| `Buildingblock/` | System architecture & component-layer diagrams |
| `Houseofquality.png`, `House_of_Quality_Smart_Hive.docx` | QFD House of Quality: customer needs → engineering requirements |
| `Bumblebee/Cert/` | Earlier NCKH (student research competition) submission: proposal, project outline, posters |
| `Bumblebee/Chân đế/` | 3D-printed enclosure & weighing-base CAD (PDF drawings + `.3mf` print files) |
| `Bumblebee/EdgeImpulse/` | Exported Edge Impulse inferencing library for the on-device queen-presence audio classifier |
| [`web/`](web/) | React + Vite + TypeScript dashboard (MapLibre GPS view), Firebase Functions, and an Express/MySQL backend |

### Not included in this repository

`Bumblebee/Dataset/` (the training-audio dataset — hive audio clips for the Queen Present / Queen Absent / External Noise classes, plus a trained `.h5` model) is **not pushed here**: it's roughly 8.2 GB across 16,000+ files, well beyond what a normal git push supports. It remains available locally; ask a team member for access if you need it.

## Status

Hardware/firmware is built around an ESP32-S3 (upgraded from an earlier STM32 BluePill prototype specifically to run the on-device edge-AI model). SHT30, GPS, and 4G subsystems are validated; load-cell calibration and field accuracy validation of the edge-AI model are in progress. See the project presentation for full details on requirements, design trade-offs, testing status, and results.
