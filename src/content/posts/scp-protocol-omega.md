---
title: "《SCP: Protocol Omega // Project Silent V2.4》游戏项目与全屏在线体验"
published: 2026-08-31
description: "基于 SCP 基金会世界观与微信 OS 仿真架构的文字解密与 AI 互动博弈 Web 游戏项目发布与在线试玩。"
tags: ["SCP", "DeepSeek", "WebGame", "React", "AI"]
category: "Projects"
draft: false
---

## 🎮 游戏简介

**《SCP: Protocol Omega // Project Silent V2.4》** 是一款基于 SCP 基金会世界观的文字解密与高压博弈互动 Web 游戏。

玩家将扮演一名被拉入公司核心战略群的被测试员工。在高压的匿名审判规则下，你需要通过与不同的 NPC 角色（Admin、HR-Linda、运维老王、销售 Tony、实习生小白）私聊与群聊互动，挖掘深藏在企业系统后台的 Project Silent 绝密真相。

---

## 🕹️ 在线直接体验 (Live Embedded Player)

下方为直接嵌入的在线游戏窗口，你可以直接在博客内进行对话与解密操作：

<div style="width: 100%; height: 820px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(0, 255, 102, 0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.8); margin: 20px 0;">
  <iframe src="/game/index.html" width="100%" height="100%" frameborder="0" style="border: none;"></iframe>
</div>

> 💡 **全屏独立窗口游玩**：如果你希望在独立全屏窗口中游玩，可以直接访问 [👉 /game/](/game/)。

---

## 🌟 核心机制与技术架构

1. **真实大模型驱动的 NPC 心理机制**：
   - 接入了 **DeepSeek 官方大模型 API**，每个 NPC 都有完整的人物性格 Prompt、知识边界与情绪弧线；
   - 包含动态信任度（Trust）与玩家怀疑度（Suspicion）实时增减系统。
2. **多结局与线索证据库**：
   - 支持解锁包括《ICU 医疗费用清单》、《服务器异常访问日志》与《死手后门代码》等 5+ 核心证据；
   - 包含正常结局、系统强制抹除结局以及反杀系统的【真结局：系统摧毁者】。
3. **极客暗黑终端视觉**：
   - 融合 CRT 扫描线背景、微信暗色消息气泡与 Web Audio API 动态合成音效。
