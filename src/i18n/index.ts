/**
 * UI language.
 *
 * Scope, stated plainly: this translates the *chrome* — buttons, panel titles,
 * inspector labels, statuses. It does NOT translate the content layer. Every
 * building, item and recipe carries a sourced factual description ("DeepSeek's
 * $1.32/$3.96 per 1M tokens"), and a machine translation of those would quietly
 * damage the one thing the game is careful about. Those strings stay in
 * `src/data` and stay English until somebody translates them deliberately.
 *
 * Adding a language: add the code to LANGUAGES and a dictionary below. A key a
 * translation is missing falls back to English rather than showing the key.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];

/** English is the key set; every other language is a partial of it. */
const en = {
  'top.cash': 'Cash',
  'top.netPerMin': 'Net / min',
  'top.operating': 'Operating',
  'top.financing': 'Financing',
  'top.afterFinancing': 'after financing',
  'top.netNote':
    'Operating is what the factory earns. Financing is what investors and the bank take out of it. Net is what reaches your cash.',
  'top.netMargin': 'Net margin',
  'top.exposure': 'Exposure',
  'top.breach': 'BREACH',
  'top.slop': 'Slop',
  'top.hardware': 'Hardware',
  'top.compute': 'Compute',
  'top.uptime': 'Uptime',
  'top.poolsTight': '{n} pools tight',
  'top.poolTight': '{n} pool tight',
  'top.saved': 'Saved',
  'top.save': 'Save',
  'top.export': 'Export',
  'top.import': 'Import',
  'top.reset': 'Reset',
  'top.signOut': 'Sign out',
  'top.pause': 'Pause',
  'top.resume': 'Resume',
  'top.exportTitle': 'Download this factory as a .json file',
  'top.importTitle': 'Load a factory from a .json file',
  'top.resetConfirm': 'Wipe the factory and start over?',
  'top.toLight': 'Switch to light mode',
  'top.toDark': 'Switch to dark mode',
  'top.language': 'Language',

  'side.nextStep': 'Next step',
  'side.inspector': 'Inspector',
  'side.techTree': 'Tech era',
  'side.showTechTree': 'Show the tech era',
  'side.close': 'Close',

  'inspector.empty':
    'Select a machine to set its recipe, clock speed and power draw. Select a belt to remove it.',
  'inspector.belt': 'Belt',
  'inspector.beltGone': 'Belt is gone.',
  'inspector.carrying': 'Carrying',
  'inspector.from': 'From',
  'inspector.to': 'To',
  'inspector.capacity': 'Capacity',
  'inspector.shape': 'Shape',
  'inspector.curve': 'Curve',
  'inspector.straight': 'Straight',
  'inspector.elbow': 'Elbow',
  'inspector.removeBelt': 'Remove belt',

  'build.title': 'Build',
  'build.contracts': 'Contract offers',
  'build.close': 'Close',
  'build.groupOnline': 'Online — provider APIs',
  'build.groupLocal': 'Local — your own hardware',
  'build.groupGenerated': 'AI-generated content',
  'build.groupOther': 'Everything else',
  'build.openTitle': 'Build (or press 1-0)',

  'quick.goesTo': 'goes to',
  'quick.comesFrom': 'comes from',
  'quick.noTakers': 'Nothing you have unlocked takes this yet.',
  'quick.noMakers': 'Nothing you have unlocked makes this yet.',
  'quick.contractLocked': 'signed, not built',
  'quick.contractTip': "Customers aren't on the shelf. Open the Contracts tab and sign this one before its offer expires.",

  'top.settings': 'Settings',
  'build.built': 'BUILT',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.addons': 'Optional tracks',
  'settings.addonsNote':
    'Side branches off the main spine. Switching one off hides its nodes and stops its milestones advancing.',
  'settings.addonsKeep':
    'Anything already on the canvas keeps running, and progress is kept — switching a track back on resumes it.',

  'vc.label': 'Investors',
  'vc.tipTitle': 'Venture Capital',
  'vc.tipShare': 'Investors take {pct}% of revenue until each round has repaid its cap.',
  'vc.roundsOpen': '{n} round(s) still repaying',
  'vc.repaid': 'repaid',
  'vc.retired': '{n} round(s) repaid in full and no longer charging.',
  'vc.loanBalance': 'Loan balance',
  'vc.loanDue': 'Due',
  'vc.openBank': 'Bank',
  'vc.raiseFund': 'Raise fund',
  'vc.raiseFundTitle': 'Raise a round?',
  'vc.raiseFundFull':
    "You're at your investors' cap — {pct}% of revenue already committed. A round has to repay before another can open.",
  'vc.capReached': '{pct}% cap reached — no new rounds until one repays.',
  'vc.offerBadge': 'Funding offer',
  'vc.downRoundBadge': 'Down round',
  'vc.offerTitle': 'Raise a round on {milestone}?',
  'vc.offerBlurb':
    'One lump sum now, against a share of revenue until the round is repaid in full. Investors collect nothing in any month the company runs at a loss — that defers the debt, it does not cancel it.',
  'vc.downRoundBlurb':
    'You are raising from weakness, and the terms say so: a bigger share of revenue and a higher repayment cap than the same money would cost a healthy company.',
  'vc.capital': 'Capital',
  'vc.share': 'Revenue share',
  'vc.repayTotal': 'Repay in total',
  'vc.repayNote':
    'The share stops the moment the round has repaid that total. It is a finite obligation, not a permanent tax.',
  'vc.totalAfter': 'Total after this round',
  'vc.decline': 'Decline',
  'vc.accept': 'Take the deal',
  'vc.bankTitle': 'The Bank',
  'vc.bankBlurb':
    'Borrow against the company, at {rate}% a month plus a {fee}% origination fee taken out of the draw. Repaid automatically out of cash on hand, whether or not the company is profitable.',
  'vc.bankProceeds': 'You receive',
  'vc.bankOutstanding': 'Outstanding loans',
  'vc.bankRemaining': '({months} mo left)',
  'vc.bankDraw': 'Draw a new loan',
  'vc.bankCap': 'Bank will lend up to',
  'vc.bankBorrow': 'Borrow',

  'top.drift': 'Drift',
  'agent.focus': 'Focus',
  'agent.focusAll': 'All contracts',
  'agent.anyIn': 'Any {track} contract',
  'agent.trackMain': 'Online',
  'agent.trackHomelab': 'Home Lab',
  'agent.trackSlop': 'AI Slop',
  'agent.locked': 'not unlocked yet',
  'agent.rarityFloor': 'Rarity floor',
  'agent.rarityAny': 'Any rarity',
  'agent.orBetter': ' or better',
  'agent.rarityDisabled': 'A named tier already implies its rarity.',
  'agent.focusGroupNote':
    'What this agent chases. It works on anything in the group that clears the rarity floor.',
  'agent.focusTierNote':
    'A specialist. It works on this tier and nothing else — and when the tier is dry it waits, spends no tokens, and bills the full subscription anyway.',
  'settings.tabAddons': 'Add-ons',
  'settings.tabConnection': 'Connections',
  'settings.connectionNote':
    'How belts are drawn. A belt you have styled on its own in the inspector keeps that style.',
  'settings.connectionKeep': 'Cosmetic only — nothing in the simulation reads it.',
  'settings.shapeCurve': 'Curve',
  'settings.shapeStraight': 'Straight',
  'settings.shapeElbow': 'Elbow',

  // --- ESG addon ----------------------------------------------------------
  'top.footprint': 'Footprint',
  'esg.badge': 'ESG',
  'esg.title': 'Footprint Report',
  'esg.blurb':
    'Everything the factory runs on that never appeared on an invoice. The number at the bottom is the one your biggest customers read.',
  'esg.pillars': 'Where it comes from',
  'esg.environmental': 'Environmental',
  'esg.social': 'Social',
  'esg.socialDetail': 'The annotation and moderation nobody photographs',
  'esg.governance': 'Governance',
  'esg.governanceDetail': 'Where the data and the silicon came from',
  'esg.footprint': 'Footprint',
  'esg.running': 'What it costs to run',
  'esg.power': 'Power',
  'esg.water': 'Water',
  'esg.gridIndex': 'Grid index',
  'esg.clean': 'Contracted clean',
  'esg.paid': 'Paid to date',
  'esg.heatSold': 'Heat sold',
  'esg.finesPaid': 'Fines paid',
  'esg.offsets': 'Offsets',
  'esg.reliefHeld': 'Relief held',
  'esg.reliefNote': 'The auditor allows {pct}% of this. Retired tonnes stop working over time.',
  'esg.buyCredits': 'Buy credits — {cost} for {relief} points',
  'esg.disclosure': 'Disclosure',
  'esg.needOfficer': 'Place a Sustainability Officer before you can publish anything.',
  'esg.auditRunning': 'Observation window',
  'esg.publishedAudited': 'Published (assured)',
  'esg.publishedSelf': 'Published (self-certified)',
  'esg.gap': 'Gap to reality',
  'esg.gapNone': 'none',
  'esg.gapWarn':
    'Your real footprint has moved past what you published. The auditor does not distinguish between a lie and a number you stopped updating.',
  'esg.nothingPublished':
    'Nothing published. Contracts with a ceiling read your real number, which is the honest default.',
  'esg.claimLabel': 'Number to publish',
  'esg.selfCertify': 'Self-certify — {cost}',
  'esg.commission': 'Commission audit — {cost}, {seconds}s',
  'esg.cooling': 'Cooling',
  'esg.tipTitle': 'Footprint',
  'esg.tipBody':
    'Power, water and land you use; people the pipeline leans on; where your data and silicon came from. Nothing here is on your invoice until it is.',
  'esg.tipDisclosed': 'Disclosed',
  'esg.tipActual': 'Actual',
  'esg.tipBill': 'Power + water',
  'esg.tipUndisclosed': 'Nothing published',
  'esg.report': 'Footprint report',
} as const;

export type Key = keyof typeof en;

const vi: Partial<Record<Key, string>> = {
  'top.cash': 'Tiền mặt',
  'top.netPerMin': 'Lãi / phút',
  'top.operating': 'Lãi vận hành',
  'top.financing': 'Chi phí tài chính',
  'top.afterFinancing': 'sau chi phí tài chính',
  'top.netNote':
    'Lãi vận hành là phần nhà máy kiếm được. Chi phí tài chính là phần nhà đầu tư và ngân hàng lấy đi. Lãi là phần thực sự vào túi bạn.',
  'top.netMargin': 'Biên lợi nhuận',
  'top.exposure': 'Rủi ro',
  'top.breach': 'RÒ RỈ',
  'top.slop': 'Nội dung rác',
  'top.hardware': 'Phần cứng',
  'top.compute': 'Năng lực tính toán',
  'top.uptime': 'Thời gian chạy',
  'top.poolsTight': '{n} nguồn đang thiếu',
  'top.poolTight': '{n} nguồn đang thiếu',
  'top.saved': 'Đã lưu',
  'top.save': 'Lưu',
  'top.export': 'Xuất file',
  'top.import': 'Nhập file',
  'top.reset': 'Làm lại',
  'top.signOut': 'Đăng xuất',
  'top.pause': 'Tạm dừng',
  'top.resume': 'Tiếp tục',
  'top.exportTitle': 'Tải nhà máy này về dưới dạng file .json',
  'top.importTitle': 'Nạp một nhà máy từ file .json',
  'top.resetConfirm': 'Xoá toàn bộ nhà máy và bắt đầu lại?',
  'top.toLight': 'Chuyển sang giao diện sáng',
  'top.toDark': 'Chuyển sang giao diện tối',
  'top.language': 'Ngôn ngữ',

  'side.nextStep': 'Bước tiếp theo',
  'side.inspector': 'Bảng chi tiết',
  'side.techTree': 'Kỷ nguyên công nghệ',
  'side.showTechTree': 'Hiện kỷ nguyên công nghệ',
  'side.close': 'Đóng',

  'inspector.empty':
    'Chọn một node để đặt công thức, tốc độ và mức tiêu thụ. Chọn một băng chuyền để gỡ bỏ.',
  'inspector.belt': 'Băng chuyền',
  'inspector.beltGone': 'Băng chuyền không còn nữa.',
  'inspector.carrying': 'Đang chuyển',
  'inspector.from': 'Từ',
  'inspector.to': 'Đến',
  'inspector.capacity': 'Công suất',
  'inspector.shape': 'Kiểu đường',
  'inspector.curve': 'Cong',
  'inspector.straight': 'Thẳng',
  'inspector.elbow': 'Gấp khúc',
  'inspector.removeBelt': 'Gỡ băng chuyền',

  'build.title': 'Xây dựng',
  'build.contracts': 'Hợp đồng đang chào',
  'build.close': 'Đóng',
  'build.groupOnline': 'Trực tuyến — API nhà cung cấp',
  'build.groupLocal': 'Nội bộ — phần cứng của bạn',
  'build.groupGenerated': 'Nội dung do AI tạo',
  'build.groupOther': 'Khác',
  'build.openTitle': 'Xây dựng (hoặc bấm phím 1-0)',

  'quick.goesTo': 'đi tới',
  'quick.comesFrom': 'đến từ',
  'quick.noTakers': 'Chưa có node nào bạn mở khoá nhận thứ này.',
  'quick.noMakers': 'Chưa có node nào bạn mở khoá tạo ra thứ này.',
  'quick.contractLocked': 'ký hợp đồng, không xây',
  'quick.contractTip': 'Khách hàng không có sẵn ở đây. Mở tab Hợp đồng và ký với khách này trước khi lời mời hết hạn.',

  'top.settings': 'Cài đặt',
  'build.built': 'ĐÃ XÂY',
  'settings.title': 'Cài đặt',
  'settings.language': 'Ngôn ngữ',
  'settings.addons': 'Nhánh tuỳ chọn',
  'settings.addonsNote':
    'Các nhánh phụ ngoài mạch chính. Tắt một nhánh sẽ ẩn node của nó và dừng tiến trình cột mốc.',
  'settings.addonsKeep':
    'Những gì đã đặt trên canvas vẫn chạy, và tiến trình được giữ — bật lại nhánh sẽ tiếp tục từ chỗ cũ.',

  'vc.label': 'Nhà đầu tư',
  'vc.tipTitle': 'Vốn đầu tư mạo hiểm',
  'vc.tipShare': 'Nhà đầu tư nhận {pct}% doanh thu cho tới khi mỗi vòng trả đủ mức trần.',
  'vc.roundsOpen': '{n} vòng đang còn trả',
  'vc.repaid': 'đã trả',
  'vc.retired': '{n} vòng đã trả đủ và không thu nữa.',
  'vc.loanBalance': 'Dư nợ vay',
  'vc.loanDue': 'Phải trả',
  'vc.openBank': 'Ngân hàng',
  'vc.raiseFund': 'Gọi vốn',
  'vc.raiseFundTitle': 'Gọi vốn?',
  'vc.raiseFundFull':
    'Bạn đã đạt mức trần của nhà đầu tư — {pct}% doanh thu đã cam kết. Một vòng phải trả xong nợ trước khi vòng khác mở ra.',
  'vc.capReached': 'Đã đạt mức trần {pct}% — không có vòng mới cho tới khi một vòng trả xong.',
  'vc.offerBadge': 'Đề nghị gọi vốn',
  'vc.downRoundBadge': 'Vòng giảm giá',
  'vc.offerTitle': 'Gọi vốn nhân cột mốc {milestone}?',
  'vc.offerBlurb':
    'Nhận một khoản vốn lớn ngay bây giờ, đổi lại một phần doanh thu cho tới khi trả đủ vòng này. Nhà đầu tư không nhận gì trong những tháng công ty lỗ — điều đó hoãn nợ lại, chứ không xoá nợ.',
  'vc.downRoundBlurb':
    'Bạn đang gọi vốn từ thế yếu, và điều khoản phản ánh đúng điều đó: phần doanh thu lớn hơn và mức trần hoàn trả cao hơn so với cùng số tiền đó với một công ty khoẻ mạnh.',
  'vc.capital': 'Vốn nhận được',
  'vc.share': 'Chia sẻ doanh thu',
  'vc.repayTotal': 'Tổng phải hoàn trả',
  'vc.repayNote':
    'Phần chia doanh thu dừng ngay khi vòng này trả đủ tổng đó. Đây là nghĩa vụ hữu hạn, không phải khoản thuế vĩnh viễn.',
  'vc.totalAfter': 'Tổng cộng sau vòng này',
  'vc.decline': 'Từ chối',
  'vc.accept': 'Nhận khoản đầu tư',
  'vc.bankTitle': 'Ngân hàng',
  'vc.bankBlurb':
    'Vay vốn cho công ty với lãi suất {rate}%/tháng, cộng phí thu xếp {fee}% trừ thẳng vào khoản giải ngân. Tự động trừ vào tiền mặt, dù công ty có lãi hay không.',
  'vc.bankOutstanding': 'Khoản vay hiện có',
  'vc.bankRemaining': '(còn {months} tháng)',
  'vc.bankDraw': 'Vay khoản mới',
  'vc.bankCap': 'Ngân hàng cho vay tối đa',
  'vc.bankProceeds': 'Bạn thực nhận',
  'vc.bankBorrow': 'Vay',

  'top.drift': 'Trôi dạt',
  'agent.focus': 'Mục tiêu',
  'agent.focusAll': 'Mọi hợp đồng',
  'agent.anyIn': 'Bất kỳ hợp đồng {track}',
  'agent.trackMain': 'Trực tuyến',
  'agent.trackHomelab': 'Home Lab',
  'agent.trackSlop': 'Nội dung rác',
  'agent.locked': 'chưa mở khoá',
  'agent.rarityFloor': 'Độ hiếm tối thiểu',
  'agent.rarityAny': 'Mọi độ hiếm',
  'agent.orBetter': ' trở lên',
  'agent.rarityDisabled': 'Chọn đích danh một hạng thì độ hiếm đã được xác định sẵn.',
  'agent.focusGroupNote':
    'Thứ agent này theo đuổi. Nó nhận mọi hợp đồng trong nhóm đạt độ hiếm tối thiểu.',
  'agent.focusTierNote':
    'Một chuyên gia. Nó chỉ làm hạng này và không gì khác — khi hạng này không có khách, nó ngồi chờ, không tốn token, và vẫn tính đủ phí thuê bao.',
  'settings.tabAddons': 'Mở rộng',
  'settings.tabConnection': 'Kết nối',
  'settings.connectionNote':
    'Cách vẽ băng chuyền. Băng chuyền bạn đã đổi kiểu riêng trong bảng thông tin vẫn giữ nguyên kiểu đó.',
  'settings.connectionKeep': 'Chỉ là hiển thị — mô phỏng không đọc giá trị này.',
  'settings.shapeCurve': 'Cong',
  'settings.shapeStraight': 'Thẳng',
  'settings.shapeElbow': 'Gấp khúc',

  // --- ESG addon ----------------------------------------------------------
  'top.footprint': 'Dấu chân',
  'esg.badge': 'ESG',
  'esg.title': 'Báo cáo dấu chân',
  'esg.blurb':
    'Tất cả những gì nhà máy tiêu thụ mà chưa bao giờ xuất hiện trên hóa đơn. Con số ở dưới cùng là con số khách hàng lớn nhất của bạn sẽ đọc.',
  'esg.pillars': 'Nó đến từ đâu',
  'esg.environmental': 'Môi trường',
  'esg.social': 'Xã hội',
  'esg.socialDetail': 'Việc gán nhãn và kiểm duyệt không ai chụp ảnh',
  'esg.governance': 'Quản trị',
  'esg.governanceDetail': 'Dữ liệu và silicon của bạn đến từ đâu',
  'esg.footprint': 'Dấu chân',
  'esg.running': 'Chi phí vận hành',
  'esg.power': 'Điện',
  'esg.water': 'Nước',
  'esg.gridIndex': 'Chỉ số lưới điện',
  'esg.clean': 'Điện sạch đã ký',
  'esg.paid': 'Đã trả đến nay',
  'esg.heatSold': 'Nhiệt đã bán',
  'esg.finesPaid': 'Tiền phạt đã trả',
  'esg.offsets': 'Tín chỉ bù trừ',
  'esg.reliefHeld': 'Mức giảm đang giữ',
  'esg.reliefNote': 'Kiểm toán viên chỉ chấp nhận {pct}% con số này. Tín chỉ đã mua sẽ mất tác dụng dần.',
  'esg.buyCredits': 'Mua tín chỉ — {cost} cho {relief} điểm',
  'esg.disclosure': 'Công bố',
  'esg.needOfficer': 'Hãy đặt một Giám đốc Bền vững trước khi có thể công bố bất cứ điều gì.',
  'esg.auditRunning': 'Thời gian quan sát',
  'esg.publishedAudited': 'Đã công bố (có kiểm toán)',
  'esg.publishedSelf': 'Đã công bố (tự khai)',
  'esg.gap': 'Chênh lệch với thực tế',
  'esg.gapNone': 'không có',
  'esg.gapWarn':
    'Dấu chân thật của bạn đã vượt qua con số đã công bố. Kiểm toán viên không phân biệt giữa một lời nói dối và một con số bạn quên cập nhật.',
  'esg.nothingPublished':
    'Chưa công bố gì. Hợp đồng có mức trần sẽ đọc con số thật của bạn — đó là mặc định trung thực.',
  'esg.claimLabel': 'Con số muốn công bố',
  'esg.selfCertify': 'Tự khai — {cost}',
  'esg.commission': 'Thuê kiểm toán — {cost}, {seconds}s',
  'esg.cooling': 'Làm mát',
  'esg.tipTitle': 'Dấu chân',
  'esg.tipBody':
    'Điện, nước và đất bạn dùng; những con người mà dây chuyền dựa vào; dữ liệu và silicon của bạn đến từ đâu. Không thứ nào nằm trên hóa đơn — cho tới khi nó nằm ở đó.',
  'esg.tipDisclosed': 'Đã công bố',
  'esg.tipActual': 'Thực tế',
  'esg.tipBill': 'Điện + nước',
  'esg.tipUndisclosed': 'Chưa công bố',
  'esg.report': 'Báo cáo dấu chân',
};

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, vi };

/** Look a key up, filling {placeholders}. Missing translations fall back to English. */
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
