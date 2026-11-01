# moting 면접 데이터 카탈로그

앱 팀용 문서입니다. 수집기가 만든 정제 데이터가 무엇이고 어떻게 쓰면 되는지, 그리고 서비스에 노출할 때 지켜야 할 출처 표기를 정리했습니다.
레코드 형식의 기준은 [`docs/contract/data-schema.md`](contract/data-schema.md) 1절(v1.0)입니다. 이 문서는 요약입니다.

- 수집일: 2026-10-30 (KST)
- 검증: `python3 -I .claude/skills/interview-crawl/scripts/validate_records.py data/processed/*.jsonl --sources crawler/sources.yaml` 통과(OK, 중복률 0.00%)
- 전체 데이터는 git에 없습니다. 위치는 아래 "파일"을 보세요. 저장소에는 샘플(`data/processed/sample_question.jsonl`, `sample_jd.jsonl`, 각 100건)만 있습니다.

## 1. 파일

전체 데이터 위치: 수집 서버의 `/data2/donginson/projects/moting/data/processed/` (gitignore 대상). 파일 하나에는 소스 하나만 담깁니다.

| 파일 | kind | 건수 | 소스(라이선스) | lang | verbatim / templated | 주요 role |
|------|------|-----:|----------------|------|---------------------:|-----------|
| `question_github-zeikar-backend-interview-guide.jsonl` | question | 508 | zeikar/backend-interview-guide (CC-BY-4.0) | ko | 0 / 508 | backend 307, devops 117, data 42 |
| `question_github-devsquad-2023-cs-study.jsonl` | question | 337 | devSquad-study/2023-CS-Study (MIT) | ko | 280 / 57 | cs 238, backend 99 |
| `question_github-murjune-android-interview.jsonl` | question | 303 | murjune/android-interview (Apache-2.0) | ko 302, en 1 | 62 / 241 | mobile 292, cs 11 |
| `question_github-boost-devs-ai-tech-interview.jsonl` | question | 210 | boost-devs/ai-tech-interview (MIT) | ko 141, **en 69** | 164 / 46 | ml 101, cs 89, data 20 |
| `question_github-zzsza-datascience-interview.jsonl` | question | 201 | zzsza/Datascience-Interview-Questions (MIT) | ko | 189 / 12 | ml 90, data 88, devops 11 |
| `question_github-gyoogle-tech-interview.jsonl` | question | 199 | gyoogle/tech-interview-for-developer (MIT) | ko | 36 / 163 | cs 142, backend 40, frontend 8 |
| `question_github-jbee-interview-beginner.jsonl` | question | 101 | jbee37142/Interview_Question_for_Beginner (MIT) | ko | 4 / 97 | cs 66, backend 18, frontend 10 |
| `question_github-smee6-frontend-jr-interview.jsonl` | question | 96 | smee6/Frontend_Jr_Interview (MIT) | ko 95, en 1 | 25 / 71 | frontend 73, cs 18, general 5 |
| `question_github-trevi00-to-senior-study.jsonl` | question | 74 | trevi00/to-senior-study (MIT) | ko | 4 / 70 | backend 63, security 6, cs 5 |
| `question_github-istudyios-ios-interview.jsonl` | question | 61 | iStudyiOS/iOS_iAmReadyForInterview (MIT) | ko | 30 / 31 | mobile 35, cs 26 |
| `question_github-woovictory-ready-for-tech-interview.jsonl` | question | 55 | WooVictory/Ready-For-Tech-Interview (MIT) | ko | 0 / 55 | cs 29, backend 16, mobile 10 |
| `question_hf-nembi-llm-job-interview.jsonl` | question | 49 | Hugging Face Nembi/llm-job-interview-dataset (Apache-2.0) | ko | 49 / 0 | ml 49 |
| `question_github-rheehot-android-interview-qna-2020.jsonl` | question | 33 | rheehot/Android-Interview-QnA-2020 (MIT) | ko | 33 / 0 | mobile 28, cs 5 |
| `question_github-gimunlee-tech-refrigerator.jsonl` | question | 19 | GimunLee/tech-refrigerator (Apache-2.0) | ko | 0 / 19 | backend 12, cs 7 |
| `question_github-jerryk026-random-interview-defense.jsonl` | question | 18 | JerryK026/random-interview-defense (MIT) | ko | 18 / 0 | cs 12, frontend 4, backend 2 |
| `question_datagokr-kimfa-interview-questions.jsonl` | question | 5 | 공공데이터포털 15150043 한국해양수산연수원 (이용허락범위 제한 없음) | ko | 0 / 5 | general 5 |
| `jd_alio-recruitment-api.jsonl` | jd | 12,187 | 잡알리오 API, 공공데이터포털 15125273 (이용허락범위 제한 없음) | ko | - | general 11,906, devops 183, backend 70, security 17, data 9, ml 2 |

질문 합계는 2,269건(ko 2,198, en 69 + 2)입니다. 소스 간 통합 중복 제거를 거친 뒤의 수치입니다. 수집 대상이었지만 0건인 소스가 하나 있습니다. `github-smee6-backend-jr-interview`는 README에 섹션 머리말만 있고 질문이 없습니다.

JD는 공고일 2025-10-30부터 2026-10-30까지의 공공기관 채용공고입니다. 데이터 스키마 2절에 따라 MVP에서는 적재만 하고 서비스에 노출하지 않습니다.

모든 소스의 `allowed_use`는 `[train, eval, serve]`입니다. 시드 로더의 serve 필터를 그대로 통과합니다.

## 2. 필드 요약

전체 정의는 [스키마 1.1 / 1.2](contract/data-schema.md#1-크롤러-레코드-jsonl-한-줄-한-레코드)에 있습니다.

- question: `id`(sha1(source_id + 정규화 질문)[:16]), `kind`, `source_id`, `source_url`, `fetched_at`, `license`, `lang`, `company`(전부 null), `role`, `interview_type`, `question`, `question_origin`, `source_heading`(templated에만 원 제목), `answer_hint`(전부 null), `follow_ups`, `tags`(소문자 영어 1~3개), `difficulty`(전부 null), `review`(전부 null. moting-authored 레코드는 아직 없음).
  - GitHub 레코드의 `source_url`은 **커밋 고정 permalink**입니다(`https://github.com/{owner}/{repo}/blob/{commit}/{path}`). 수집 시점의 원문을 그대로 가리킵니다.
- jd: `id`(sha1(source_id + external_id)[:16]), `title`, `company`(기관명), `role`, `requirements`(신청자격 `aplyQlfcCn`을 줄·불릿 단위로 나눈 것), `preferred`(우대조건 `prefCondCn`을 쉼표·줄 단위로 나눈 것), `screening`(전형절차 `scrnprcdrMthdExpln`, 1,500자에서 자름), `posted_at`(YYYY-MM-DD), `external_id`(`recrutPblntSn`), `source_url`(기관 공고 URL `srcUrl`, 없으면 `https://job.alio.go.kr/recruitview.do?idx={external_id}`).
- 개인정보: 이메일, 전화(휴대·유선·대표번호), 주민번호 패턴, 실명 지칭("담당자: ○○○", "면접관 ○○○ 과장")은 `[REDACTED]`로 바꿨습니다. JD에서는 문의, 담당자, 연락처, 팩스, 이메일이 들어간 줄을 통째로 지웠습니다.

## 3. 분포 (질문 2,269건)

**role**
| cs | backend | mobile | ml | data | devops | frontend | security | general | pm·design·marketing·sales·finance·hr |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 668 | 561 | 371 | 241 | 150 | 133 | 99 | 28 | 18 | 0 |

**interview_type**: technical 2,226 · behavioral 32 · case 11 · culture/personality/other 0

**question_origin**: templated 1,375 (61%) · verbatim 894 (39%) · extracted/authored 0

**lang**: ko 2,198 · en 71 (boost-devs의 Python 영어 질문 69건 포함. 세션 선택 풀은 `lang='ko'`만 쓰므로 영어 질문은 노출되지 않습니다)

**꼬리질문**: `follow_ups`가 있는 질문은 43건(꼬리질문 89개)입니다. boost-devs(딥러닝), zzsza, rheehot, devsquad(P사)처럼 원문에 중첩 구조가 있는 소스에서만 나옵니다.

**세션 풀 관점(ko 기준, 스키마 4절)**
| role | technical | behavioral | case |
|------|---:|---:|---:|
| cs | 668 | 0 | 0 |
| backend | 561 | 0 | 0 |
| mobile | 370 | 0 | 0 |
| ml | 166 | 6 | 0 |
| data | 131 | 8 | 11 |
| devops | 133 | 0 | 0 |
| frontend | 98 | 0 | 0 |
| security | 28 | 0 | 0 |
| general | 0 | 18 | 0 |

워밍업 후보(role=general이면서 tags에 `intro` 또는 `motivation`이 있는 질문)는 12건입니다.

## 4. 알려진 한계

1. **인성 질문이 크게 부족합니다.** behavioral/personality는 32건이고 그중 general은 18건뿐입니다. behavioral 세션이나 mixed 세션을 돌리면 같은 질문이 반복됩니다. 비IT 직무(pm, design, marketing, sales, finance, hr)는 0건입니다. 대안은 자체 저작(`moting-authored`, 사람 검수 필수), AI Hub 채용면접 데이터(사용자 결정 대기), 커뮤니티 소스(needs_review)입니다.
2. **templated가 61%입니다.** 개념 해설형 저장소(zeikar, gyoogle, jbee, woovictory, gimunlee, murjune 일부)는 목차 제목만 있습니다. 그래서 "{주제}에 대해 설명해 주세요." 형태로 만들었습니다. 문장이 단조롭고, 일부는 맥락 없이 막연합니다(예: "라우팅에 대해 설명해 주세요.", "저장방식에 따른 분류에 대해 설명해 주세요."). 엔진에서 LLM으로 다시 말하게 하거나 verbatim을 우선 고르는 방법을 권합니다.
3. **zeikar(508건)는 작성자가 README에 "Codex, Claude Code, Harness를 활용해 작성"이라고 밝힌 AI 보조 문서입니다.** trevi00(74건)도 2026년에 작성된 정리 노트입니다. 이 둘은 중복 제거 우선순위를 낮게 두었습니다.
4. **hf-nembi(49건)는 합성 데이터입니다.** 가상 지원자 이력서를 전제로 한 질문이라 "LLaVA 파인튜닝 경험이 있으시군요…"처럼 지원자 맥락이 질문에 박혀 있습니다. 꼬리질문 예시나 프롬프트 참고용으로는 맞지만, 첫 질문으로 쓰기에는 부적절합니다.
5. **datagokr-kimfa(5건)는 원본이 자기소개서 문항입니다.** 19행 모두 글자제한이 붙은 자소서 문항이고, 원래 면접 질문은 0건이었습니다. 고유 문항 5개를 구술 질문 형태로 바꿔 templated로 냈습니다. 원 문항은 `source_heading`에 있습니다. 빼려면 `--kimfa-mode skip`으로 다시 수집하면 됩니다.
6. **라벨은 규칙 기반입니다.** role, tags는 섹션 제목과 키워드로 정했습니다. 섹션 경계에서 오분류가 나옵니다(예: 안드로이드 저장소의 OS 질문, 프론트 저장소의 네트워크 질문). tags에도 잡음이 있습니다. difficulty는 전부 null입니다.
7. **JD role 매핑은 거칩니다.** NCS 대분류가 `정보통신`인 공고만 기술 role을 받습니다. 정보통신만 있거나, 정보통신을 포함하면서 제목에 IT 키워드가 있는 경우입니다. 세부 role은 제목 키워드로 정했고, 매핑표는 `crawler/moting_crawler/sources/alio.py`의 `IT_TITLE_ROLE`에 있습니다. 나머지는 모두 general입니다. "운영·설비·통신" 키워드는 devops로 갑니다. 그래서 현장 설비 유지보수 공고도 devops로 분류됩니다.
8. **JD의 requirements는 원문을 줄 단위로 나눈 것입니다.** "<공통 응시자격>" 같은 머리말 줄이나 결격사유 안내가 섞여 있습니다.
9. 중복 제거는 정규화 텍스트 완전 일치와, 같은 role 안의 문자 3-gram Jaccard ≥ 0.85로만 합니다(5절). 표현만 다른 같은 개념(예: "프로세스와 스레드의 차이" vs "Process vs Thread")은 남아 있을 수 있습니다.

## 5. 정제 기준 (요약)

- 질문화: 원문이 질문 문장이면 verbatim입니다. 끝 물음표나 마침표 정도만 정규화했습니다. 주제 제목이면 templated로 만들고 원 제목은 `source_heading`에 넣었습니다. 실습, 링크, 공지, 세미나 같은 항목과 "정의", "특징" 같은 일반 소제목은 버렸습니다. 해설 본문과 답변은 저장하지 않았습니다.
- 꼬리질문: 원문에서 질문(또는 질문 토글, 질문 헤딩) 아래에 중첩된 질문 문장이 있으면 `follow_ups`로 옮겼습니다.
- 중복 제거(전 소스 통합): ① 정규화 텍스트 완전 중복은 role과 무관하게 1건만 남깁니다. ② 같은 role 안에서 근사 중복을 제거합니다. 템플릿 꼬리("…에 대해 설명해 주세요" 등)를 뗀 핵심부의 3-gram Jaccard가 0.85 이상이면 근사 중복입니다. 핵심부가 6자 미만이면 근사 비교를 하지 않습니다. 둘 중 남기는 쪽은 verbatim > templated → 꼬리질문이 많은 쪽 → 소스 우선순위(질문 리스트형 원문 > 개념 목차 > AI 보조/합성) → 더 긴 질문 순으로 정합니다. 버려지는 쪽의 꼬리질문은 남는 쪽에 합쳤습니다. 이번 실행에서 2,492건이 2,269건이 됐습니다(완전 중복 192, 근사 중복 31).

## 6. 출처 표기 의무 (serve 시)

질문을 화면에 노출하거나 생성 근거로 인용할 때는 레코드의 `source_url`과 `license`를 표시하고, 아래 표기문을 앱의 "오픈소스·데이터 출처" 화면에 함께 실어야 합니다. MIT와 Apache-2.0은 라이선스 전문 사본도 함께 제공해야 합니다(사본: 각 저장소 LICENSE, 수집 서버 `data/raw/github/<source_id>/LICENSE`). 모든 templated 질문은 원 제목을 질문 문장으로 **변경**한 것입니다. CC BY 4.0과 Apache-2.0은 변경 사실을 표시해야 합니다.

### MIT (저작권 표기는 각 LICENSE 파일 원문 그대로)
| source_id | 저장소 | 커밋 | 저작권 표기 |
|-----------|--------|------|-------------|
| github-jbee-interview-beginner | https://github.com/jbee37142/Interview_Question_for_Beginner | 26c959a | `Copyright (c) 2017 Jbee` |
| github-gyoogle-tech-interview | https://github.com/gyoogle/tech-interview-for-developer | 41a7e91 | `Copyright (c) 2019 Gyuseok Kim` |
| github-woovictory-ready-for-tech-interview | https://github.com/WooVictory/Ready-For-Tech-Interview | 3140415 | `Copyright (c) 2020 이승우` |
| github-boost-devs-ai-tech-interview | https://github.com/boost-devs/ai-tech-interview | ee05fc3 | `Copyright (c) 2021 boost-devs` |
| github-zzsza-datascience-interview | https://github.com/zzsza/Datascience-Interview-Questions | 112583b | `Copyright (c) 2018 Seong Yun Byeon` |
| github-smee6-frontend-jr-interview | https://github.com/smee6/Frontend_Jr_Interview | be970fa | `Copyright (c) 2022 Seo Myung In` |
| github-istudyios-ios-interview | https://github.com/iStudyiOS/iOS_iAmReadyForInterview | c10bc43 | `Copyright (c) 2022 I Study iOS` |
| github-devsquad-2023-cs-study | https://github.com/devSquad-study/2023-CS-Study | 98b7bdb | `Copyright (c) 2023 Junyong Moon` (LICENSE.md) |
| github-rheehot-android-interview-qna-2020 | https://github.com/rheehot/Android-Interview-QnA-2020 | 2b96605 | `Copyright (c) 2020 SungBin` |
| github-trevi00-to-senior-study | https://github.com/trevi00/to-senior-study | 9111f1f | `Copyright (c) 2026 trevi00` |
| github-jerryk026-random-interview-defense | https://github.com/JerryK026/random-interview-defense | 84a3c05 | `Copyright (c) 2023 SeokyungKim` |

MIT 허가 고지문입니다. 11개 저장소 LICENSE의 본문은 저작권 줄만 빼면 바이트 단위로 같습니다(정규화 후 해시 일치로 확인). 위 저작권 표기 바로 아래에 이 전문을 그대로 함께 싣습니다.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache License 2.0
| source_id | 출처 | 커밋/리비전 | 표기 |
|-----------|------|-------------|------|
| github-murjune-android-interview | https://github.com/murjune/android-interview | e235b60 | LICENSE 부록의 저작권 줄이 `Copyright [yyyy] [name of copyright owner]`(미기입) 상태이고 NOTICE 파일은 없습니다. 이 경우 "murjune/android-interview, Licensed under the Apache License, Version 2.0, 질문 문장으로 변환함"으로 표기합니다. |
| github-gimunlee-tech-refrigerator | https://github.com/GimunLee/tech-refrigerator | d93a8ac | 위와 같습니다(저작권 줄 미기입, NOTICE 없음). "GimunLee/tech-refrigerator, Licensed under the Apache License, Version 2.0, 질문 문장으로 변환함" |
| github-smee6-backend-jr-interview | https://github.com/smee6/Backend_Jr_Interview | 61a03e6 | 레코드가 0건이라 표기 대상이 아닙니다. |
| hf-nembi-llm-job-interview | https://huggingface.co/datasets/Nembi/llm-job-interview-dataset | 4023027 | 데이터셋 카드 `license: apache-2.0`입니다. LICENSE 파일과 NOTICE는 없습니다. "Nembi/llm-job-interview-dataset (Hugging Face), Apache License 2.0" |

### CC BY 4.0
| source_id | 출처 | 커밋 | 표기 |
|-----------|------|------|------|
| github-zeikar-backend-interview-guide | https://github.com/zeikar/backend-interview-guide | f8d049e | 저장소 README 원문: "이 저장소의 콘텐츠는 CC BY 4.0 라이선스로 배포됩니다. 자유롭게 공유·변형할 수 있으며, 출처만 표시해 주세요." 표기문: "백엔드 개발자 면접 가이드(zeikar, https://github.com/zeikar/backend-interview-guide), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), 문서 제목을 면접 질문 문장으로 변경함" |

### 공공데이터포털 (이용허락범위 제한 없음)
| source_id | 표기 |
|-----------|------|
| datagokr-kimfa-interview-questions | "한국해양수산연수원_자기소개질문관리, 공공데이터포털(https://www.data.go.kr/data/15150043/fileData.do), 자기소개서 문항을 면접 질문으로 변경함" |
| alio-recruitment-api | "재정경제부_공공기관 채용정보 조회서비스(잡알리오), 공공데이터포털(https://www.data.go.kr/data/15125273/openapi.do)" |

레코드의 `license` 값은 `MIT`, `Apache-2.0`, `CC-BY-4.0`, `data.go.kr:unrestricted` 네 가지입니다.

## 7. 재수집

저장소 루트에서 표준 라이브러리만으로 실행합니다(Python 3.10 이상). 데이터 루트는 `--data-dir`로 지정하고, 기본값은 저장소 루트의 `data/`입니다.

```sh
# 질문 소스 전체(GitHub 15 + HF + data.go.kr) 수집 → interim → 통합 중복 제거 → processed
python -m crawler.run --source questions --data-dir /data2/donginson/projects/moting/data
#   GitHub 저장소가 data/raw/github/<source_id>/에 없으면 git clone --depth 1(훅·LFS 비활성, 코드 실행 없음)
#   이미 있으면 그대로 재사용. 새로 받지 않으려면 --no-clone

# 소스 하나만, 소량 확인
python -m crawler.run --source github-boost-devs-ai-tech-interview --limit 20 --data-dir ...

# 잡알리오 JD (최근 365일, 일일 호출 상한 300, data/raw/alio/state.json 체크포인트로 이어받기)
MOTING_ENV_FILE=/data2/donginson/projects/moting/.env \
  python -m crawler.run --source alio-recruitment-api --max-calls 300 --data-dir ...
#   저장된 페이지만 다시 파싱: --parse-only
#   처음부터 다시 받으려면 data/raw/alio/state.json과 pages/를 지운다

# interim → processed 재빌드, 샘플 작성
python -m crawler.run --build --data-dir ...
python -m crawler.run --samples data/processed --data-dir ...

# 검증(완료 조건)
python3 -I .claude/skills/interview-crawl/scripts/validate_records.py <data-dir>/processed/*.jsonl --sources crawler/sources.yaml
```

게이트: `crawler/sources.yaml`에서 `status: allowed`이고 `waiting_on`이 `user_download`/`user_decision`이 아닌 소스만 수집기가 실행합니다. 서비스키는 `.env`의 `DATA_GO_KR_SERVICE_KEY` 또는 환경변수에서 읽습니다. 로그, 에러, 원본 파일 어디에도 키를 남기지 않습니다.
