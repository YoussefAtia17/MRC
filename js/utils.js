// =========================================================================
// الدوال المساعدة المشتركة (Utilities & UI Helpers)
// =========================================================================

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

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('flex');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.getElementById(id).classList.remove('flex');
}

function viewDealImage(dealId) {
    const d = state.deals.find(x => x.id === dealId);
    if (!d || !d.item_image_url) return;
    document.getElementById('lightboxImg').src = d.item_image_url;
    document.getElementById('lightboxCaption').textContent = `صورة ديل العميل: ${d.client_name} (${d.watch_brand || d.deal_details})`;
    openModal('imageViewerModal');
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

function compressAndPreviewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
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
            compressedImageDataUrl = canvas.toDataURL('image/jpeg', 0.65);
            const preview = document.getElementById('imagePreview');
            preview.src = compressedImageDataUrl;
            preview.classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function deleteRow(table, id) {
    if (!confirm("هل أنت متأكد من الحذف النهائي؟")) return;
    await db.from(table).delete().eq('id', id);
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