// =========================================================================
// إعدادات الاتصال بقاعدة البيانات (Supabase Configuration)
// =========================================================================
const SUPABASE_URL = "https://ofleigxmkwwddyiqcuzp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6aj1y1aXteYExxAam4Yo1g_bM16edkp";

const isConfigured = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

// توكن الجلسة اللي السيرفر بيدّيه بعد الدخول، وبيتبعت مع كل request في هيدر x-mrc-session
let sessionToken = sessionStorage.getItem('mrc_token') || localStorage.getItem('mrc_token');

function createDbClient(token) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: token ? { 'x-mrc-session': token } : {} }
    });
}

let db = isConfigured ? createDbClient(sessionToken) : null;

// الأعمدة المسموح بقرايتها من جدول المستخدمين (الباسورد مش متاح من الـ API)
const APP_USER_COLUMNS = 'id, full_name, email, phone, role, created_at, archived_at';

// =========================================================================
// المتغيرات العامة وحالة التطبيق (Global State)
// =========================================================================
let currentUser = null;
let compressedImageDataUrl = "";
let isTreasuryUnlocked = false;
let isWhatsappUnlocked = false;
let selectedEmployeeHistoryId = null;
let selectedWaInstanceId = null;

let state = {
    employees: [],
    deals: [],
    empFinancials: [],
    treasury: [],
    users: [],
    waInstances: []
};

const SWISS_BRANDS = [
    "Rolex (رولكس)", "Patek Philippe (باتيك فيليب)", "Audemars Piguet - AP (أوديمار بيجيه)",
    "Omega (أوميجا)", "Cartier (كارتييه)", "Vacheron Constantin (فاشيرون كونستانتين)",
    "Richard Mille (ريتشارد ميل)", "Breitling (بريتلينج)", "Hublot (هوبلو)",
    "IWC Schaffhausen", "TAG Heuer (تاج هوير)", "Jaeger-LeCoultre",
    "Panerai (بانيراي)", "Tudor (تيودور)", "Longines (لونجين)",
    "Tissot (تيسو)", "Hamilton (هاميلتون)", "Rado (رادو)"
];

const SYSTEM_LOCK_EMAILS = ['treasury@mrc.lock', 'whatsapp@mrc.lock'];