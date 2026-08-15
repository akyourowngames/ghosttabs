import type { ContextItem, Workspace } from "@/types";

const now = Date.now();
const MIN = 60_000;
const HR = 3_600_000;
const DAY = 86_400_000;

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: "ws-ai",
    name: "AI Browser Agent",
    goal: "Build a Chrome extension that connects AI workflows across tools.",
    createdAt: now - 3 * DAY,
    updatedAt: now - 12 * MIN,
  },
  {
    id: "ws-research",
    name: "Research Sprint",
    goal: "Summarize the Q3 competitor landscape and propose positioning.",
    createdAt: now - 6 * DAY,
    updatedAt: now - 2 * HR,
  },
  {
    id: "ws-launch",
    name: "Launch Plan",
    goal: "Prepare the hackathon demo and the final pitch deck.",
    createdAt: now - DAY,
    updatedAt: now - 40 * MIN,
  },
];

export const MOCK_TABS: Record<string, number> = {
  "ws-ai": 4,
  "ws-research": 2,
  "ws-launch": 3,
};

export const MOCK_CONTEXT: Record<string, ContextItem[]> = {
  "ws-ai": [
    {
      id: "c1",
      workspaceId: "ws-ai",
      type: "goal",
      title: "Project goal",
      content:
        "A universal context layer so AI tools share memory instead of starting from scratch.",
      createdAt: now - 3 * DAY,
    },
    {
      id: "c2",
      workspaceId: "ws-ai",
      type: "decision",
      title: "Architecture decision",
      content:
        "React + TypeScript + IndexedDB + Manifest V3, local-first, no backend.",
      source: { platform: "Claude" },
      createdAt: now - 2 * DAY,
    },
    {
      id: "c3",
      workspaceId: "ws-ai",
      type: "page",
      title: "GitHub repository",
      content:
        "github.com/team/ghosttab — background worker + content script scaffolding.",
      source: {
        url: "https://github.com/team/ghosttab",
        platform: "GitHub",
      },
      createdAt: now - DAY,
    },
    {
      id: "c4",
      workspaceId: "ws-ai",
      type: "page",
      title: "API documentation",
      content:
        "OpenRouter API reference for chat completions and model routing.",
      source: { url: "https://openrouter.ai/docs", platform: "Docs" },
      createdAt: now - 20 * HR,
    },
    {
      id: "c5",
      workspaceId: "ws-ai",
      type: "conversation",
      title: "Claude conversation",
      content:
        "Discussed the context-transfer problem and chose a clipboard fallback for reliability.",
      source: { platform: "Claude" },
      createdAt: now - 12 * MIN,
    },
    {
      id: "c6",
      workspaceId: "ws-ai",
      type: "question",
      title: "Open question",
      content: "How should context be transferred between AI tools reliably?",
      createdAt: now - 30 * MIN,
    },
  ],
  "ws-research": [
    {
      id: "r1",
      workspaceId: "ws-research",
      type: "goal",
      title: "Research goal",
      content: "Map competitors and define our differentiation for the pitch.",
      createdAt: now - 6 * DAY,
    },
    {
      id: "r2",
      workspaceId: "ws-research",
      type: "decision",
      title: "Scope decision",
      content: "Focus on developer tools, not general consumers.",
      source: { platform: "ChatGPT" },
      createdAt: now - 5 * DAY,
    },
    {
      id: "r3",
      workspaceId: "ws-research",
      type: "page",
      title: "Competitor teardown",
      content: "Notes on three adjacent context-capture products.",
      source: { platform: "Docs" },
      createdAt: now - 2 * HR,
    },
  ],
  "ws-launch": [
    {
      id: "l1",
      workspaceId: "ws-launch",
      type: "goal",
      title: "Launch goal",
      content: "Ship a flawless 7-minute demo for the hackathon judges.",
      createdAt: now - DAY,
    },
    {
      id: "l2",
      workspaceId: "ws-launch",
      type: "decision",
      title: "Demo flow",
      content: "Claude → GhostTab → GitHub/docs → ChatGPT as the killer path.",
      source: { platform: "Claude" },
      createdAt: now - 40 * MIN,
    },
  ],
};
