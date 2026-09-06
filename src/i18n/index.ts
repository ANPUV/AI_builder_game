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
  'side.techTree': 'Tech tree',
  'side.showTechTree': 'Show the tech tree',
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
} as const;

export type Key = keyof typeof en;

const vi: Partial<Record<Key, string>> = {
  'top.cash': 'Tiền mặt',
  'top.netPerMin': 'Lãi / phút',
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
  'side.techTree': 'Cây công nghệ',
  'side.showTechTree': 'Hiện cây công nghệ',
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
