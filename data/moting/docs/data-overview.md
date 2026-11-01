# moting 수집 데이터 한눈에 보기

> 기준일 2026-10-30 · 자세한 파일 설명과 출처 표기 문구는 [`data-catalog.md`](data-catalog.md), 필드 정의는 [`contract/data-schema.md`](contract/data-schema.md)

## 요약

| | 건수 | 내용 | 크기 |
|---|---:|---|---:|
| **면접 질문** | **2,269** | GitHub 면접 질문 모음 14개 + Hugging Face 1개 + 공공데이터 1개 | 1.6 MB |
| **채용공고(JD)** | **12,187** | 잡알리오 API — 공공기관 350곳, 최근 1년 공고 | 22 MB |

- 위치: `data/processed/` (git 제외). 저장소에는 샘플 `sample_question.jsonl`, `sample_jd.jsonl`만 있음(각 100건)
- 검증: 개인정보·중복·출처 검사 통과, 중복률 0.00%
- 모든 수집 소스가 학습·평가·서비스 노출(`train/eval/serve`) 허용, 상업 이용 가능 라이선스(MIT · Apache-2.0 · CC-BY-4.0 · 공공데이터 제한 없음)

## 1. 면접 질문 2,269건

### 직무(role)별

```
cs        ████████████████████████████████  668
backend   ███████████████████████████       561
mobile    ██████████████████                371
ml        ████████████                      241
data      ███████                           150
devops    ██████                            133
frontend  █████                              99
security  █                                  28
general   █                                  18
```
pm · design · marketing · sales · finance · hr: **0건**

### 면접 유형

| 기술(technical) | 인성(behavioral) | 상황(case) |
|---:|---:|---:|
| 2,226 (98%) | 32 | 11 |

### 자주 나오는 주제(tag) Top 15

db 311 · ds-algo 252 · network 221 · android 220 · os 206 · java 196 · system-design 169 · devops 145 · ml 96 · python 86 · javascript 79 · spring 79 · kotlin 73 · dl 67 · security 61

### 언어

한국어 2,198 · 영어 71

### 출처별

| 소스 | 건수 | 주 직무 | 라이선스 |
|---|---:|---|---|
| zeikar/backend-interview-guide | 508 | backend, devops | CC-BY-4.0 |
| devSquad-study/2023-CS-Study | 337 | cs, backend | MIT |
| murjune/android-interview | 303 | mobile | Apache-2.0 |
| boost-devs/ai-tech-interview | 210 | ml, cs (영어 69) | MIT |
| zzsza/Datascience-Interview-Questions | 201 | ml, data | MIT |
| gyoogle/tech-interview-for-developer | 199 | cs | MIT |
| jbee37142/Interview_Question_for_Beginner | 101 | cs | MIT |
| smee6/Frontend_Jr_Interview | 96 | frontend | MIT |
| trevi00/to-senior-study | 74 | backend | MIT |
| iStudyiOS/iOS_iAmReadyForInterview | 61 | mobile | MIT |
| WooVictory/Ready-For-Tech-Interview | 55 | cs | MIT |
| Hugging Face Nembi/llm-job-interview-dataset | 49 | ml | Apache-2.0 |
| rheehot/Android-Interview-QnA-2020 | 33 | mobile | MIT |
| GimunLee/tech-refrigerator | 19 | backend | Apache-2.0 |
| JerryK026/random-interview-defense | 18 | cs | MIT |
| 공공데이터 한국해양수산연수원 | 5 | general | 제한 없음 |

### 질문 예시

| 직무 | 예시 |
|---|---|
| cs | TCP 3-way-handshake에 대해 설명해 주세요. |
| backend | Nested Loop Join에 대해 설명해 주세요. |
| frontend | 비동기 모델과 이벤트 루프에 대해 설명해 주세요. |
| mobile | Proguard의 원리는? |
| ml | 강화학습에서 다이나믹 프로그래밍은 어떤 의미를 가질까요? 한계점은 무엇이 있을까요? |
| data | 평균(mean)과 중앙값(median) 중에 어떤 케이스에서 뭐를 써야 할까요? |
| devops | VPC에 대해 설명해 주세요. |
| security | API 보안에 대해 설명해 주세요. |
| 인성 | 지금까지 성취한 일 중 가장 기억에 남는 일과, 그것을 이루기 위해 어떤 노력을 했는지 말씀해 주세요. |
| 상황 | 동시에 여러 개의 A/B 테스트를 돌리기엔 모수가 부족한 상황입니다. 어떻게 해야 할까요? |

## 2. 채용공고(JD) 12,187건

- 기간: 2025-10-30 ~ 2026-10-30, 월 800~1,300건
- 기관 350곳. 많은 순: 한전KPS 989 · 근로복지공단 892 · 국립공원공단 721 · 한국폴리텍 517 · 한국보훈복지의료공단 508 · 국립중앙의료원 486 · 대한적십자사 477 · 한국수자원공사 372 · 한전KDN 322
- 담긴 정보: 공고 제목, 기관, 자격요건(공고당 평균 7줄), 우대사항(98% 보유), 전형절차(100% 보유), 공고일
- 직무: 일반직 11,906 · IT(devops 183, backend 70, security 17, data 9, ml 2) 281

## 3. 아직 비어 있는 부분

| 공백 | 현황 | 채울 수 있는 방법 |
|---|---|---|
| 인성 질문 | 32건뿐 | NCS 면접문항 이용허락 문의 · LLM 초안 + 사람 검수 |
| IT 외 직무 질문 (기획·마케팅·영업·인사 등) | 0건 | 위와 같음 · AI Hub(학습용만) |
| 기업별 면접 후기 | 0건 | 후기 사이트는 약관·봇 차단으로 수집 불가 |
| 민간 기업 JD | 0건 | 민간 채용 플랫폼은 수집 불가 → 사용자가 공고를 붙여넣는 방식 권장 |

## 4. 조사한 소스 96곳

| 판정 | 수 | 대표 예 |
|---|---:|---|
| 허용(allowed) | 28 | GitHub 질문 모음, 잡알리오·나라일터 API |
| 차단(blocked) | 29 | 잡플래닛, 블라인드, 캐치, 링커리어, 원티드, Glassdoor |
| 검토 필요(needs_review) | 39 | 잡코리아·사람인 후기(법적 위험), AI Hub, 라이선스 없는 GitHub 저장소 |

판정 근거: [`docs/sources/`](sources/), 목록: [`crawler/sources.yaml`](../crawler/sources.yaml)
