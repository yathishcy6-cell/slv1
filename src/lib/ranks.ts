export type HunterRank = { level: number; name: string; title: string };
export const RANKS: HunterRank[] = [
  { level: 1, name: "E-00", title: "Awakened" },
  { level: 2, name: "E-01", title: "Unregistered" },
  { level: 3, name: "E-02", title: "Initiate" },
  { level: 4, name: "E-03", title: "Novice" },
  { level: 5, name: "E-04", title: "Trainee" },
  { level: 6, name: "D-00", title: "Field Recruit" },
  { level: 8, name: "D-01", title: "Scout" },
  { level: 10, name: "D-02", title: "Pathfinder" },
  { level: 12, name: "D-03", title: "Striker" },
  { level: 14, name: "D-04", title: "Vanguard" },
  { level: 16, name: "C-00", title: "Rising Hunter" },
  { level: 19, name: "C-01", title: "Adept" },
  { level: 22, name: "C-02", title: "Specialist" },
  { level: 25, name: "C-03", title: "Operative" },
  { level: 28, name: "C-04", title: "Sentinel" },
  { level: 31, name: "B-00", title: "Elite Operative" },
  { level: 35, name: "B-01", title: "Vanguard Prime" },
  { level: 39, name: "B-02", title: "Warden" },
  { level: 43, name: "B-03", title: "Apex" },
  { level: 47, name: "B-04", title: "Nightwatch" },
  { level: 51, name: "A-00", title: "High Hunter" },
  { level: 56, name: "A-01", title: "Executor" },
  { level: 61, name: "A-02", title: "Overseer" },
  { level: 66, name: "A-03", title: "Dominion" },
  { level: 71, name: "A-04", title: "Paragon" },
  { level: 76, name: "S-00", title: "Monarch Candidate" },
  { level: 82, name: "S-01", title: "Monarch" },
  { level: 88, name: "S-02", title: "Shadow Sovereign" },
  { level: 94, name: "SS", title: "Transcendent" },
  { level: 100, name: "SSS", title: "System Breaker" }
];

export function rankForLevel(level: number) {
  return [...RANKS].reverse().find((rank) => level >= rank.level) ?? RANKS[0];
}
export function nextRank(level: number) {
  return RANKS.find((rank) => rank.level > level) ?? null;
}
// Leveling curve increases with level. This is XP needed for the next level.
export function xpForNextLevel(level: number) {
  return Math.round(130 + Math.pow(level, 1.22) * 24);
}
