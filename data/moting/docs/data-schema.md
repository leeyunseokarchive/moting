# moting 데이터 스키마
version: 1.0

범위 메모(2026-10-29): 우리 산출물은 1절(크롤러 레코드)이다. 2절 이후 DB·API 연결은 앱 팀 참고용 제안이며 앱 팀이 다르게 구현할 수 있다.

소유자: moting-architect. 크롤러 레코드 형식은 이 문서가 기준이다(`interview-crawl` 3절은 기본값). 관련: `docs/contract/api.md` v1.0, ADR 0005·0007.

데이터 흐름:
```
crawler/sources.yaml ──(시드 로더)──────────────▶ sources 테이블
data/processed/{kind}_{source_id}.jsonl ─(검증·serve 필터)─▶ questions / job_postings 테이블
세션 진행 ───────────────────────────────────────▶ sessions / turns / feedback 테이블
```
DB는 파생물이다. `data/moting.db`를 지우고 시드 로더를 다시 돌리면 질문 은행이 복원된다(세션 기록은 제외).

## 1. 크롤러 레코드 (JSONL, 한 줄 한 레코드)

### 1.1 kind = question (리뷰에서 추출한 질문도 question 레코드로 낸다)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string(16 hex) | 예 | `sha1(source_id + normalized_text)[:16]`. normalized_text = 공백 정규화·양끝 공백 제거·NFC |
| kind | `"question"` | 예 | |
| source_id | string | 예 | `crawler/sources.yaml`의 id. 직접 작성은 `moting-authored` |
| source_url | string\|null | 예 | 원 파일·페이지 URL. 직접 작성은 null |
| fetched_at | string(ISO 8601) | 예 | 수집(작성) 시각 |
| license | string | 예 | `MIT`, `Apache-2.0`, `CC-BY-4.0`, `KOGL-1`, `moting-internal` 등 |
| lang | `"ko"`\|`"en"` | 예 | |
| company | string\|null | 예 | MVP 미사용 |
| role | Role | 예 | API Role과 같은 15개 값. 모르면 `general` |
| interview_type | `technical\|behavioral\|culture\|case\|personality\|other` | 예 | 세션 유형 매핑은 4절 |
| question | string | 예 | 질문 문장(한 문장~두 문장) |
| question_origin | `verbatim\|templated\|extracted\|authored` | 예 | **v1.0에서 `authored` 추가** — moting-authored 전용 |
| source_heading | string\|null | 아니오 | templated일 때 원 제목 |
| answer_hint | string\|null | 예 | 우리가 쓴 구조 힌트 200자 이내만. 원문 해설 요약 금지 |
| follow_ups | string[] | 예 | 원문/작성 꼬리질문. 없으면 `[]` |
| tags | string[] | 예 | 소문자 영어 1~3개. 워밍업용은 `intro` 또는 `motivation` 포함 |
| difficulty | `1\|2\|3`\|null | 예 | 1=기초 2=중급 3=심화. 모르면 null |
| review | object\|null | 조건부 | `moting-authored`면 **필수**: `{"drafted_by": "llm:<model>"\|"human", "reviewed_by": string, "reviewed_at": ISO 8601}`. 그 외 null 또는 생략 |

### 1.2 kind = jd
| 필드 | 타입 | 설명 |
|------|------|------|
| id, kind(`"jd"`), source_id, source_url, fetched_at, license, lang | | 1.1과 동일 |
| title | string | 공고명 |
| company | string | 기관명 |
| role | Role | 직무 매핑(모르면 general) |
| requirements | string[] | 자격요건(`aplyQlfcCn`)을 항목 단위로 |
| preferred | string[] | 우대조건(`prefCondCn`). 없으면 `[]` |
| screening | string\|null | 전형절차(`scrnprcdrMthdExpln`) 요약·원문 일부 |
| posted_at | string\|null | 공고일 |
| external_id | string | 원 공고 ID(재수집 중복 제거용) |

개인정보(담당자 이름·전화·이메일)는 정제 단계에서 제거한다. 남아 있으면 로더가 거부하지는 않지만 QA가 실패로 판정한다.

### 1.3 kind = review
MVP에서 수집 소스 없음(후기 사이트 전부 blocked/needs_review). 생기면 추출 질문을 1.1 레코드(`question_origin: "extracted"`)로 내고, 원문은 저장하지 않는다.

### 1.4 kind = interview_review (수작업 후기)
사람이 직접 열람한 후기를 붙여넣으면 사실만 정리해 `data/processed/interview_reviews.jsonl`에 쌓는다(`crawler/manual_reviews.py`). 원문은 저장하지 않고, 질문은 짧은 사실 문장으로, 분위기는 우리 말로 요약한다. 시연 회사 9곳 + KISA, 직무 `개발`.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | sha1(company·job·stage·interview_date·format.notes·정렬된 questions)[:16], 중복 제거용 |
| kind | string | `interview_review` |
| company | string | 네이버·카카오·토스·삼성전자·LG전자·SK하이닉스·ETRI·한전KDN·한국전력공사·KISA |
| category | string | `it`·`large`·`public` (company에서 자동) |
| job | string | 원 후기의 직무 표기(기본 `개발`) |
| stage | string\|null | 면접 단계(예: 1차 기술면접, 임원면접) |
| format | object | `{interviewers: int\|null, duration_min: int\|null, mode: 대면\|온라인\|혼합\|null, coding_test: bool\|null, notes: string}` |
| questions | string[] | 받은 질문 |
| atmosphere | string\|null | 분위기 한두 문장 요약 |
| pressure | int\|null | 압박 강도 1~5(후기 서술로 판단, 근거 없으면 null) |
| result | string\|null | 합격·불합격·대기 |
| interview_date | string\|null | YYYY 또는 YYYY-MM |
| source_site | string | 잡코리아·사람인·velog·지인 경험 등 |
| source_url | string\|null | 열람한 페이지 |
| entered_by | string | `manual-paste` |
| added_at | string | ISO 8601 |

## 2. DB 테이블 (SQLite, ADR 0005)

### sources
| 컬럼 | 타입 | 출처 |
|------|------|------|
| source_id | TEXT PK | sources.yaml `id` |
| name | TEXT | 표시명. sources.yaml에 `name`이 있으면 그것, 없으면 URL에서 유도(GitHub `owner/repo`, HF `owner/dataset`, data.go.kr는 기관·데이터명) |
| url | TEXT | sources.yaml `url` |
| kind | TEXT | sources.yaml `kind` |
| status | TEXT | `allowed\|blocked\|needs_review` |
| allowed_use | TEXT(JSON array) | sources.yaml `allowed_use` — **노출 판정의 원천** |
| license | TEXT | 레코드 license의 대표값(로더가 첫 레코드에서 채움) |
| checked_at | TEXT | sources.yaml `checked_at` |

### questions (질문 은행)
| 컬럼 | 타입 | 크롤러 필드 | 비고 |
|------|------|------------|------|
| question_id | TEXT PK | id | |
| source_id | TEXT FK→sources | source_id | |
| source_url | TEXT NULL | source_url | Attribution.source_url |
| license | TEXT | license | Attribution.license |
| lang | TEXT | lang | 선택 시 `ko`만 |
| role | TEXT | role | |
| interview_type | TEXT | interview_type | 원값 보존. 세션 매핑은 4절 |
| text | TEXT | question | |
| question_origin | TEXT | question_origin | 품질 분석용 |
| source_heading | TEXT NULL | source_heading | |
| answer_hint | TEXT NULL | answer_hint | 피드백 프롬프트 참고용(사용자에 직접 노출 안 함) |
| follow_ups | TEXT(JSON) | follow_ups | 작성·원문 꼬리질문 — Mock·LLM 실패 시 대체 꼬리질문 |
| tags | TEXT(JSON) | tags | 다양성 순회 |
| difficulty | INTEGER NULL | difficulty | |
| company | TEXT NULL | company | MVP 미사용, 보존 |
| fetched_at | TEXT | fetched_at | |
| reviewed_by | TEXT NULL | review.reviewed_by | authored만 |
| loaded_at | TEXT | (로더) | |

버리는 크롤러 필드: `kind`(테이블로 구분), `review.drafted_by`·`review.reviewed_at`(감사용, JSONL에 남아 있음).

### job_postings (MVP: 적재만, 서비스 노출 없음)
1.2 필드를 그대로 컬럼으로(`requirements`·`preferred`는 JSON). PK `jd_id` = id, UNIQUE(source_id, external_id).

### sessions
| 컬럼 | 타입 | 비고 |
|------|------|------|
| session_id | TEXT PK | UUID4 |
| role | TEXT | API Role |
| interview_type | TEXT | `technical\|behavioral\|mixed` |
| num_questions | INTEGER | 3~10 |
| max_follow_ups | INTEGER | 0~2 |
| status | TEXT | `in_progress\|completed\|abandoned` |
| created_at, updated_at, completed_at | TEXT | completed_at NULL 가능 |
| last_activity_at | TEXT | 30분 무응답 판정 |
| report_status | TEXT | `none\|generating\|ready\|failed` |
| overall_score | REAL NULL | |
| summary | TEXT NULL | |
| top_weaknesses | TEXT(JSON) NULL | |
| next_practice | TEXT(JSON) NULL | |
| llm_provider | TEXT | 세션 시작 시 설정값(비교 분석용) |

### turns
| 컬럼 | 타입 | 비고 |
|------|------|------|
| turn_id | TEXT PK | UUID4 |
| session_id | TEXT FK→sessions | |
| seq | INTEGER | 세션 내 생성 순서 0.. (UNIQUE(session_id, seq)) |
| kind | TEXT | `main\|follow_up` |
| main_index | INTEGER | API `index`(1부터) |
| follow_up_index | INTEGER | main=0 |
| parent_turn_id | TEXT NULL FK→turns | |
| interview_type | TEXT | `technical\|behavioral`(턴 루브릭) |
| question_id | TEXT NULL FK→questions | generated면 NULL |
| question_source | TEXT | `bank\|generated` |
| question_text | TEXT | 질문 스냅샷(은행이 재시드돼도 기록 보존) |
| follow_up_reason | TEXT NULL | LLM 판단 reason |
| answer_text | TEXT NULL | |
| asked_at | TEXT | |
| answered_at | TEXT NULL | |

### feedback
| 컬럼 | 타입 | 비고 |
|------|------|------|
| turn_id | TEXT PK FK→turns | |
| score | INTEGER | 1~5 |
| strengths | TEXT(JSON) | |
| improvements | TEXT(JSON) | |
| model_answer_hint | TEXT NULL | |
| rubric | TEXT(JSON) | `[{criterion,label,score,comment}]` |
| provider, model | TEXT | |
| input_tokens, output_tokens, latency_ms | INTEGER | 비용·지연 비교 |
| created_at | TEXT | |

## 3. 시드 로더 규칙 (backend, T6)
1. `crawler/sources.yaml` → `sources` upsert.
2. `data/processed/question_*.jsonl`, `review_*.jsonl`(1.3) → 레코드별:
   - `source_id`가 sources에 없으면 거부.
   - 소스 `status != allowed` 또는 `allowed_use`에 `serve` 없음 → **적재하지 않음**(건수만 로그).
   - `source_id == "moting-authored"`인데 `review.reviewed_by`가 없으면 거부.
   - 필수 필드·enum 위반 → 거부(`crawler`의 `validate_records.py`와 같은 규칙).
   - `question_id` 기준 upsert(재실행 멱등).
3. `data/processed/jd_*.jsonl` → `job_postings` upsert(serve 판정 동일).
4. 끝에 요약 출력: 소스별 적재/제외/거부 건수, role×interview_type 분포.

**`allowed_use`·`question_origin`·`source_id` 전달 경로:**
| 값 | 크롤러 | DB | API |
|----|--------|----|-----|
| allowed_use | sources.yaml(소스 단위) | `sources.allowed_use` — 로더 필터 + 선택 쿼리 조인 필터 | 노출 안 함(서버 내부 게이트) |
| source_id | 레코드 `source_id` | `questions.source_id` FK | `Question.attribution.source_id`(외부 소스만), `/attributions` |
| question_origin | 레코드 `question_origin` | `questions.question_origin` | 노출 안 함(품질 분석용). API `source`는 bank/generated 구분만 |
| license / source_url | 레코드 | `questions.license`, `questions.source_url` | `Attribution.license`, `Attribution.source_url` |

`attribution`이 null인 경우: `source_id == "moting-authored"`(자체 저작) 또는 `question_source == "generated"`.

## 4. 세션 선택 풀 (엔진, T2) — `/roles.available`도 같은 규칙
공통 조건: `lang = 'ko'` AND 소스가 allowed+serve.

크롤러 `interview_type` → 턴 유형:
| 크롤러 값 | 턴 interview_type | 비고 |
|-----------|------------------|------|
| technical, case | technical | case(케이스 면접)는 직무 역량 질문으로 취급 |
| behavioral, personality, culture | behavioral | |
| other | (선택 안 함) | 워밍업 태그(`intro`·`motivation`)가 있으면 워밍업 후보 |

세션 유형별 풀(role = R):
| 세션 interview_type | 본 질문 풀 |
|--------------------|-----------|
| technical | role=R ∧ technical. R이 IT 직무(`backend, frontend, mobile, data, ml, devops, security`)면 role=`cs` ∧ technical 추가 |
| behavioral | role∈{R, `general`} ∧ behavioral |
| mixed | technical 풀과 behavioral 풀에서 번갈아(본 질문 수의 절반씩, 홀수면 technical 하나 더) |
- R=`cs`: technical 풀은 cs만. R=`general`: behavioral 풀은 general만, technical 풀은 비어 있음(`available.technical`=0).
- 워밍업: role=`general` ∧ tags에 `intro` 또는 `motivation` 있는 질문 1개를 index=1로(behavioral 턴). 워밍업도 `num_questions`에 포함된다.
- `available.technical`/`available.behavioral` = 위 풀의 질문 수(워밍업 제외).

## 5. 변경 이력
| version | 날짜 | 변경 | 영향 |
|---------|------|------|------|
| 1.0 | 2026-10-29 | 초기. interview-crawl 3절 대비: `question_origin`에 `authored` 추가, `review` 필드(moting-authored 필수) 추가, `difficulty` 1~3 정의, jd 레코드에 `preferred`·`screening`·`posted_at`·`external_id` 추가, 워밍업 태그 `intro`/`motivation` 규약 | data-crawler, backend-engineer, qa-integrator |
