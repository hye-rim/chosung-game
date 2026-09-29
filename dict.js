'use strict';

// 훈민정음(초성 게임)의 사전과 문제 뽑기. 서버가 한 번 읽어 두고 혼자 하기·온라인 모두 같은 사전으로 판정한다.
const fs = require('fs');
const path = require('path');
const H = require('./public/hangul.js');

const readList = (f) => fs.readFileSync(path.join(__dirname, 'data', f), 'utf8').split('\n').filter(Boolean);
const nouns = readList('nouns.txt');          // 정답 판정용 (2~3글자 명사 전체)
const common = readList('common.txt');        // 자주 쓰는 명사: 문제를 고르는 기준, 틀렸을 때 보여 줄 예시
const commonSet = new Set(common);
// 정답으로 인정하는 말 = 명사 전체 + 자주 쓰는 말 (학습용 어휘에는 '간접적', '그렇게' 같은 명사 목록에 없는 말도 있다)
const allSet = new Set(nouns);
for (const w of common) allSet.add(w);
const accepted = [...allSet];

// 초성 → 단어 수 (쌍자음이 들어간 초성은 문제로 내지 않으니 셈에서 뺀다)
const countAll = new Map(), countCommon = new Map(), commonBy = new Map(), allBy = new Map();
for (const w of accepted) {
  const k = H.choseong(w);
  if (!H.isPrompt(k)) continue;
  countAll.set(k, (countAll.get(k) || 0) + 1);
  if (!allBy.has(k)) allBy.set(k, []);
  allBy.get(k).push(w);
}
for (const w of common) {
  const k = H.choseong(w);
  if (!H.isPrompt(k)) continue;
  countCommon.set(k, (countCommon.get(k) || 0) + 1);
  if (!commonBy.has(k)) commonBy.set(k, []);
  commonBy.get(k).push(w);
}

// 문제 후보 묶음: letters 글자, 전체 단어가 minAll 개 이상, 자주 쓰는 단어가 minCommon 개 이상
function pool(letters, minAll, minCommon) {
  return [...countAll].filter(([k, n]) => k.length === letters && n >= minAll && (countCommon.get(k) || 0) >= minCommon).map(([k]) => k);
}
const POOLS = {
  easy2: pool(2, 30, 3),       // 술술 나오는 두 글자
  mid2: pool(2, 10, 1),        // 좀 덜 흔한 두 글자
  hard3: pool(3, 10, 1),       // 세 글자
  party2: pool(2, 30, 1),      // 온라인: 여러 명이 돌려 말하니 답이 넉넉한 것만
  party3: pool(3, 30, 1),
};

const choice = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// 혼자 도전의 단계: 맞힌 개수로 레벨이 오르고, 오를수록 덜 흔한 초성·세 글자가 나오고 시간이 줄어든다
const levelOf = (correct) => 1 + Math.floor(correct / 4);
function specFor(level, rng = Math.random) {
  let kind = 'easy2', letters = 2;
  if (level >= 6) { if (rng() < 0.5) { kind = 'hard3'; letters = 3; } else kind = 'mid2'; }
  else if (level >= 3) kind = 'mid2';
  const time = Math.max(9, 20 - (level - 1) * 1.2) + (letters === 3 ? 3 : 0);
  return { kind, letters, time };
}

function pickPrompt(kind, rng = Math.random, exclude = new Set()) {
  const list = POOLS[kind].filter((k) => !exclude.has(k));
  return choice(list.length ? list : POOLS[kind], rng);
}

// 판정: 초성이 맞는지 → 사전에 있는지. rare 는 '자주 쓰는 말이 아님'(점수 보너스)
function check(word, initials) {
  const w = String(word || '').trim();
  if (!H.matches(w, initials)) return { ok: false, reason: 'shape' };
  if (!allSet.has(w)) return { ok: false, reason: 'unknown' };
  return { ok: true, rare: !commonSet.has(w) };
}

// 틀렸을 때 보여 줄 예시 (자주 쓰는 말 먼저)
function examples(initials, k = 3, rng = Math.random) {
  const src = commonBy.get(initials) || allBy.get(initials) || [];
  const out = [];
  const copy = src.slice();
  while (out.length < k && copy.length) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return out;
}

const stats = () => ({ nouns: accepted.length, common: common.length, pools: Object.fromEntries(Object.entries(POOLS).map(([k, v]) => [k, v.length])) });

module.exports = { H, POOLS, levelOf, specFor, pickPrompt, check, examples, stats, has: (w) => allSet.has(w), isCommon: (w) => commonSet.has(w) };
