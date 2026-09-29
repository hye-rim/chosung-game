'use strict';

// 한글 초성 도우미. 브라우저와 서버(Node)가 같이 쓴다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hangul = factory();
})(this, function () {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';        // 초성 19개 (쌍자음 포함)
  const BASIC = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';                  // 문제로 내는 초성 14개 (쌍자음은 문제에서 뺀다)

  const isSyllable = (ch) => { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3; };

  // '사촌' → 'ㅅㅊ'. 한글 음절이 아닌 글자가 하나라도 있으면 빈 문자열
  function choseong(word) {
    let out = '';
    for (const ch of String(word)) {
      if (!isSyllable(ch)) return '';
      out += CHO[Math.floor((ch.charCodeAt(0) - 0xac00) / 588)];
    }
    return out;
  }

  // 단어가 초성과 딱 맞는가 (글자 수도 같아야 한다)
  const matches = (word, initials) => !!initials && choseong(word) === initials;

  // 문제로 쓸 수 있는 초성 모양인가 (기본 자음 2~3개)
  const isPrompt = (s) => /^[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ]{2,3}$/.test(s || '');

  return { CHO, BASIC, isSyllable, choseong, matches, isPrompt };
});
