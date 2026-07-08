# POE2 Search Bridge kor-Eng

카카오 PoE2 거래소와 글로벌(pathofexile.com) 거래소 간 검색을 위한 Tampermonkey 유저스크립트입니다.

한국 검색 > 글로벌 결과

글로벌 검색 > 한국 결과 


## 기능

- 한국 거래소 UI에서 **글로벌 검색** 버튼 추가
- Vue store(`window.app.$store.state.persistent`)에서 검색 상태 직접 읽기
- 아이템 **name / type / term**만 한→영 변환 ([POE2_ItemDict](https://github.com/thething99/POE2_ItemDict) 사용)
- **옵션(stat) 필터**는 ID 그대로 전송 (한국 API 호출 없음)

## 설치

1. [Tampermonkey](https://www.tampermonkey.net/) 설치
2. `userscript/poe2-ko-to-en-search.user.js` 내용을 새 스크립트로 추가
or
https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-search-bridge-ko2en.user.js 
접속해서 자동 설치
3. https://poe.kakaogames.com/trade2 접속

## 사용법

1. 카카오 PoE2 거래소에서 아이템·옵션 검색 조건 설정
2. **글로벌 검색** 버튼 클릭
3. 글로벌 거래소 결과가 새 탭에서 열림

글로벌 거래소 > 한글 검색 동일

## 딕셔너리 CDN

```
https://cdn.jsdelivr.net/gh/thething99/POE2_ItemDict@<tag>/item_dict.json
```

PoE2 패치 후 딕셔너리 태그를 업데이트하려면 `userscript/poe2-ko-to-en-search.user.js`의 `BASE_URL` / `DATA_VERSION`을 수정하세요.

## 관련 저장소

- [POE2_ItemDict](https://github.com/thething99/POE2_ItemDict) — 한→영 아이템 딕셔너리 데이터

## 라이선스

MIT
