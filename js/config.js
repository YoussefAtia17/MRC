// =========================================================================
// إعدادات الاتصال بقاعدة البيانات (Supabase Configuration)
// =========================================================================
const SUPABASE_URL = "https://oxfyuvzaclrvxvdljrtb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sw_Cv73ea6fcd_Pxfa2rww_f9W2Dm-I";

const isConfigured = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;
const db = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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