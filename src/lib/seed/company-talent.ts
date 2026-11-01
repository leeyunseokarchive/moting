/**
 * 회사별 인재상·중시 가치(2026-10-30 조사). 원문 복제가 아니라 짧은 사실 재서술이다.
 * kind: official은 회사 공식 페이지, press는 회사 담당자 발언을 실은 기사.
 * restricted: 해당 출처가 상업 이용·가공을 금지했거나 약관을 확인하지 못했다. 상업 전환 시 빼야 한다.
 * 인재상 원문을 확인하지 못한 ETRI, 한전KDN, KISA는 넣지 않았다(지어내지 않는다).
 */
export type CompanyTalent = {
  company: string;
  talent: string[];
  notes?: string;
  source: string;
  kind: "official" | "press";
  restricted?: boolean;
};

export const COMPANY_TALENT: CompanyTalent[] = [
  {
    company: "삼성전자",
    talent: ["열정: 미래에 끊임없이 도전", "창의혁신: 창의와 혁신으로 세상을 변화", "인간미·도덕성: 정직과 바른 행동으로 책임을 다함"],
    source: "https://www.samsungcareers.com/subsid/detail/C10CAA",
    kind: "official",
  },
  {
    company: "LG전자",
    talent: ["도전: 꿈을 좇으며 최고 수준을 지향", "팀워크: 헌신적이고 열정적인 팀 플레이어", "고객 우선의 지속적 혁신", "전문성과 글로벌 무대에서의 주도성", "LG Way를 존중하는 정직함"],
    source: "https://lg.com/au/about-lg/career",
    kind: "official",
  },
  {
    company: "토스",
    talent: ["개인보다 미션 우선", "더 높은 수준 추구", "임팩트 집중", "모든 가정에 질문하기", "완벽보다 실행", "주도적 학습", "신속한 움직임", "피드백 자주 구하기"],
    notes: "핵심 가치 3.1. 2022년부터 채용·평가·보상에 적용한다.",
    source: "https://toss.im/tossfeed/article/core-values-are-evolving",
    kind: "official",
    restricted: true,
  },
  {
    company: "SK하이닉스",
    talent: ["VWBE: 자발적이고 의욕적인 두뇌 활용", "SUPEX: 인간이 도달할 수 있는 최고 수준 지향", "패기: 높은 목표에 도전하고 성장", "기술 인재: 기술 경쟁력, 문제 해결 능력, 집념", "반도체 이해도", "협업 능력: 설계부터 양산까지 여러 부서와 소통"],
    notes: "채용 전 과정에서 성장 가능성을 가장 중점적으로 본다. 면접은 인재상·직무 적합성, 문제 해결, 협업 시너지를 확인한다.",
    source: "https://news.skhynix.co.kr/talk-about-the-talent-you-want/",
    kind: "official",
    restricted: true,
  },
  {
    company: "카카오",
    talent: ["신뢰: 서로 믿고 함께 일함", "충돌: 직급과 무관하게 의견을 부딪힘", "헌신: 충분히 논쟁한 결론을 수용하고 몰입", "공유"],
    notes: "공식 인재상 문서는 확인하지 못했고 2018년 인사 총괄이 밝힌 철학 기준이다.",
    source: "https://www.kakaocorp.com/page/detail/8487",
    kind: "official",
    restricted: true,
  },
  {
    company: "네이버",
    talent: ["변화를 두려워하지 않는 열린 마인드", "서비스에 대한 애정"],
    notes: "공식 인재상 문서는 없고 2024년 HR 리더 발언 기준이다.",
    source: "https://zdnet.co.kr/view/?no=20240311215553",
    kind: "press",
  },
  {
    company: "한국전력공사",
    talent: ["기업가형", "통섭형", "가치창조형", "도전형"],
    notes: "지속가능경영보고서 작성자가 면접관으로 참여하기도 하므로 회사 사업 이해를 확인한다(2022년 채용 담당자 발언).",
    source: "https://www.mt.co.kr/industry/2022/10/12/2022101217300891754",
    kind: "press",
  },
];
