// =========================================================================
// الدوال المساعدة المشتركة (Utilities & UI Helpers)
// =========================================================================

// تأمين النصوص قبل عرضها جوه HTML (منع XSS)
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const colors = {
        success: 'bg-emerald-600 border-emerald-700',
        info: 'bg-blue-600 border-blue-700',
        warning: 'bg-amber-600 border-amber-700'
    };
    const toast = document.createElement('div');
    toast.className = `toast-animate pointer-events-auto ${colors[type] || colors.info} text-white p-4 rounded-2xl shadow-2xl border flex justify-between items-start gap-3 text-xs font-bold`;
    toast.innerHTML = `
        <div>🔔 ${message}</div>
        <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white font-extrabold">✕</button>
    `;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 6000);
}

// كل الفورمز بتعدي من هنا: الضغطة التانية (أو Enter مرتين) وهي لسه بتحفظ بتتجاهل،
// عشان مايتسجلش نفس الحساب أو الحركة مرتين
async function submitOnce(event, handler) {
    event.preventDefault();
    const form = event.target;
    if (form.dataset.busy) return;
    form.dataset.busy = '1';
    const buttons = [...form.querySelectorAll('button[type="submit"], button:not([type])')];
    buttons.forEach(b => { b.disabled = true; b.classList.add('opacity-60', 'cursor-wait'); });
    try {
        await handler(event);
    } finally {
        delete form.dataset.busy;
        buttons.forEach(b => { b.disabled = false; b.classList.remove('opacity-60', 'cursor-wait'); });
    }
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('flex');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.getElementById(id).classList.remove('flex');
}

function getDealImages(d) {
    if (Array.isArray(d.item_images) && d.item_images.length) return d.item_images;
    return d.item_image_url ? [d.item_image_url] : [];
}

let lightboxImages = [];
let lightboxIndex = 0;
let lightboxTitle = '';

function viewDealImage(dealId, index = 0) {
    const d = state.deals.find(x => x.id === dealId);
    if (!d) return;
    lightboxImages = getDealImages(d);
    if (!lightboxImages.length) return;
    const about = d.watch_brand || d.deal_details;
    lightboxTitle = `صور ديل العميل: ${d.client_name || '-'}${about ? ` (${about})` : ''}`;
    showLightboxImage(index);
    openModal('imageViewerModal');
}

function showLightboxImage(index) {
    const total = lightboxImages.length;
    lightboxIndex = (index + total) % total;
    document.getElementById('lightboxImg').src = lightboxImages[lightboxIndex];
    document.getElementById('lightboxCaption').textContent = total > 1 ? `${lightboxTitle} — ${lightboxIndex + 1} / ${total}` : lightboxTitle;
    document.getElementById('lightboxPrev').classList.toggle('hidden', total < 2);
    document.getElementById('lightboxNext').classList.toggle('hidden', total < 2);
}

function isSameLocalDay(dateString) {
    if (!dateString) return false;
    const d = new Date(dateString);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
}

function isSameLocalMonth(dateString) {
    if (!dateString) return false;
    const d = new Date(dateString);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth();
}

function getCurrentTreasuryBalance() {
    let totalIn = 0, totalOut = 0;
    state.treasury.forEach(t => {
        if (t.transaction_type === 'in') totalIn += Number(t.amount || 0);
        else if (t.transaction_type === 'out') totalOut += Number(t.amount || 0);
    });
    return totalIn - totalOut;
}

function compressImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxW = 700;
                const scale = maxW / img.width;
                canvas.width = img.width > maxW ? maxW : img.width;
                canvas.height = img.width > maxW ? img.height * scale : img.height;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// بتضيف الصور المختارة على اللي موجودة (تقدر تختار كذا صورة مرة واحدة أو على مرات)
async function compressAndPreviewImage(event) {
    const files = [...event.target.files].filter(f => f.type.startsWith('image/'));
    event.target.value = '';
    for (const file of files) {
        try { dealImages.push(await compressImageFile(file)); } catch { alert(`⚠️ الصورة (${file.name}) مش مقروءة`); }
    }
    renderDealImagesPreview();
}

function removeDealImage(index) {
    dealImages.splice(index, 1);
    renderDealImagesPreview();
}

function renderDealImagesPreview() {
    const box = document.getElementById('imagePreview');
    box.innerHTML = dealImages.map((src, i) => `
        <div class="relative">
            <img src="${esc(src)}" class="h-24 w-24 rounded-lg border object-cover">
            <button type="button" onclick="removeDealImage(${i})" title="شيل الصورة" class="absolute -top-2 -left-2 bg-rose-600 hover:bg-rose-700 text-white w-6 h-6 rounded-full text-xs font-bold shadow">✕</button>
        </div>`).join('');
    box.classList.toggle('hidden', dealImages.length === 0);
    document.getElementById('imageCountLabel').textContent = dealImages.length ? `(${dealImages.length} صورة)` : '';
}

async function deleteRow(table, id) {
    if (!confirm("هل أنت متأكد من الحذف النهائي؟")) return;
    const { data, error } = await db.from(table).delete().eq('id', id).select('id');
    if (error) return alert("❌ لا يمكن الحذف: " + error.message);
    if (!data || data.length === 0) return alert("⛔ مش مسموح لك تحذف السجل ده (صلاحية الأونر بس).");
    await loadAllData();
}

function switchPage(pageId) {
    if (pageId === 'treasury' && !isTreasuryUnlocked) {
        return requestTreasuryAccess();
    }
    if (pageId === 'whatsapp' && !isWhatsappUnlocked) {
        return requestWhatsappAccess();
    }
    ['deals', 'employees', 'treasury', 'whatsapp', 'users'].forEach(p => {
        const sec = document.getElementById(`page-${p}`);
        if (sec) sec.classList.add('hidden');
        const btn = document.getElementById(`tab-${p}`);
        if (btn) { btn.classList.remove('tab-active'); btn.classList.add('text-slate-300'); }
    });
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`tab-${pageId}`);
    if (activeBtn) { activeBtn.classList.add('tab-active'); activeBtn.classList.remove('text-slate-300'); }
}

function handleOutsideClick(event) {
    const watchContainer = document.getElementById('watchBrandDropdownContainer');
    const watchMenu = document.getElementById('watchDropdownMenu');
    if (watchContainer && watchMenu && !watchMenu.classList.contains('hidden')) {
        if (!watchContainer.contains(event.target)) {
            watchMenu.classList.add('hidden');
        }
    }

    if (selectedEmployeeHistoryId) {
        const clickedInsideCard = event.target.closest('.emp-card-item');
        const clickedInsideHistory = event.target.closest('#selectedEmployeeHistoryBox');
        if (!clickedInsideCard && !clickedInsideHistory) {
            closeEmployeeHistory();
        }
    }

    if (selectedWaInstanceId) {
        const clickedInsideWaCard = event.target.closest('.wa-card-item');
        const clickedInsideWaBox = event.target.closest('#selectedWaDealsBox');
        if (!clickedInsideWaCard && !clickedInsideWaBox) {
            closeWaDealsHistory();
        }
    }
}