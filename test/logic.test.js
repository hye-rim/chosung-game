'use strict';

// 초성 계산·판정·문제 뽑기 테스트. 실행: npm test
const test = require('node:test');
const assert = require('node:assert');
const H = require('../public/hangul.js');
const D = require('../dict.js');

test('choseong and matches', () => {
  assert.strictEqual(H.choseong('사촌'), 'ㅅㅊ');
  assert.strictEqual(H.choseong('abc'), '');
  assert.ok(H.matches('사촌', 'ㅅㅊ'));
  assert.ok(!H.matches('사촌들', 'ㅅㅊ'));              // letter count must match too
  assert.ok(!H.matches('사촌', ''));
});

test('isPrompt: only basic consonants, 2 or 3 letters', () => {
  assert.ok(H.isPrompt('ㅅㅊ') && H.isPrompt('ㄱㄴㄷ'));
  assert.ok(!H.isPrompt('ㄲㅅ') && !H.isPrompt('ㅅ') && !H.isPrompt('ㅅㅊㅁㅂ') && !H.isPrompt('사촌'));
});

test('check: shape, unknown, ok', () => {
  assert.strictEqual(D.check('사과', 'ㅂㅂ').reason, 'shape');
  assert.strictEqual(D.check('ㅅㅊ', 'ㅅㅊ').reason, 'shape');
  assert.strictEqual(D.check('샤촌불', 'ㅅㅊㅂ').reason, 'unknown');
  assert.ok(D.check('사촌', 'ㅅㅊ').ok);
});

test('prompt pools are non-empty and every prompt has answers', () => {
  for (const [kind, list] of Object.entries(D.POOLS)) {
    assert.ok(list.length > 20, kind + ' pool size ' + list.length);
    for (const k of list.slice(0, 40)) assert.ok(D.examples(k, 3).length > 0, kind + ' ' + k);
  }
});

test('levels get harder: time shrinks, three-letter prompts appear', () => {
  assert.ok(D.specFor(1).time > D.specFor(12).time);
  assert.strictEqual(D.specFor(1).letters, 2);
  assert.ok(Array.from({ length: 80 }, () => D.specFor(8).letters).includes(3));
  assert.strictEqual(D.levelOf(0), 1); assert.strictEqual(D.levelOf(4), 2);
});

test('pickPrompt avoids recent prompts when it can', () => {
  const recent = new Set(D.POOLS.easy2.slice(0, D.POOLS.easy2.length - 1));
  for (let i = 0; i < 20; i++) assert.ok(!recent.has(D.pickPrompt('easy2', Math.random, recent)));
});
