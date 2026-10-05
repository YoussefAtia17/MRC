// =========================================================================
// إدارة الصفقات، الساعات السويسرية، ومعاينة الواتساب (Deals Module)
// =========================================================================

let searchTimer;
function handleSearchDeals(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderDeals(q.trim()), 120);
}

function toggleWatchDropdown() {
    const menu = document.getElementById('watchDropdownMenu');
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        document.getElementById('watchBrandSearchInput').value = '';
        filterWatchBrandsList('');
        setTimeout(() => document.getElementById('watchBrandSearchInput').focus(), 50);
    } else {
        menu.classList.add('hidden');
    }
}

function filterWatchBrandsList(query = '') {
    const q = query.trim().toLowerCase();
    const container = document.getElementById('watchBrandsListItems');
    const filtered = SWISS_BRANDS.filter(b => b.toLowerCase().includes(q));

    let html = `<div onclick="selectWatchBrandOption('')" class="p-2.5 hover:bg-blue-50 cursor-pointer text-slate-500">-- بدون تحديد ماركة --</div>`;
    html += filtered.map(b => `
        <div onclick="selectWatchBrandOption('${b}')" class="p-2.5 hover:bg-blue-50 cursor-pointer text-slate-800">${b}</div>
    `).join('');

    html += `
        <div onclick="selectWatchBrandOption('custom', '${query.trim()}')" class="p-2.5 bg-blue-50 hover:bg-blue-100 cursor-pointer text-blue-700 font-extrabold">
            ➕ نوع آخر (إضافة يدوية)${query.trim() ? `: "${query.trim()}"` : '...'}
        </div>`;

    container.innerHTML = html;
}

function selectWatchBrandOption(val, prefillCustom = '') {
    document.getElementById('watchBrandSelect').value = val;
    document.getElementById('watchDropdownMenu').classList.add('hidden');
    const customInput = document.getElementById('watchBrandCustom');
    const label = document.getElementById('selectedWatchBrandLabel');

    if (val === 'custom') {
        label.textContent = '➕ نوع آخر (مكتوب يدوياً)';
        customInput.classList.remove('hidden');
        if (prefillCustom) customInput.value = prefillCustom;
        customInput.focus();
    } else {
        label.textContent = val || '-- اختر أو اكتب ماركة الساعة --';
        customInput.classList.add('hidden');
        customInput.value = '';
    }
    updateWhatsAppPreview();
}

function getSelectedWatchBrand() {
    const sel = document.getElementById('watchBrandSelect').value;
    if (sel === 'custom') {
        return document.getElementById('watchBrandCustom').value.trim();
    }
    return sel;
}

function fillDefaultReminderText() {
    const client = document.getElementById('clientName').value.trim() || 'عميلنا العزيز';
    const brand = getSelectedWatchBrand() || 'الساعة المعروضة';
    const mt = document.getElementById('meetingTime').value;
    const timeFormatted = mt ? new Date(mt).toLocaleString('ar-EG') : 'الموعد المتفق عليه';
    const msg = `أهلاً بك أستاذ ${client} 👋\nنذكركم بموعدنا في (MRC) بخصوص (${brand}) في تمام: ${timeFormatted}.\nفي انتظاركم، وشكراً لتعاملكم معنا! ⌚`;
    document.getElementById('reminderMessage').value = msg;
    updateWhatsAppPreview();
}

function updateWhatsAppPreview() {
    const customMsg = document.getElementById('reminderMessage').value.trim();
    if (customMsg) {
        document.getElementById('waPreviewText').textContent = customMsg;
    } else {
        const client = document.getElementById('clientName').value.trim() || 'العميل';
        const brand = getSelectedWatchBrand() || 'الساعة';
        const mt = document.getElementById('meetingTime').value;
        const timeFormatted = mt ? new Date(mt).toLocaleString('ar-EG') : '(لم يحدد الوقت بعد)';
        document.getElementById('waPreviewText').textContent = `أهلاً بك أستاذ ${client} 👋\nتذكير بموعدنا بخصوص (${brand}) في الموعد: ${timeFormatted}`;
    }
}

function onAmountPaidChange(val) {
    const paid = Number(val || 0);
    const statusSelect = document.getElementById('dealStatus');
    if (paid > 0) {
        statusSelect.value = 'completed';
    } else if (statusSelect.value === 'completed') {
        statusSelect.value = 'in_progress';
    }
}

function onDealStatusChange(status) {
    const paidInput = document.getElementById('amountPaid');
    if (status === 'cancelled') {
        paidInput.value = 0;
        paidInput.disabled = true;
    } else if (status === 'in_progress') {
        paidInput.value = 0;
        paidInput.disabled = false;
    } else if (status === 'completed') {
        paidInput.disabled = false;
        if (Number(paidInput.value) <= 0) paidInput.focus();
    }
}

async function reopenCancelledDeal(dealId) {
    const d = state.deals.find(x => x.id === dealId);
    if (!d) return;

    const { error } = await db.from('deals').update({ status: 'in_progress' }).eq('id', dealId);
    if (error) return alert("❌ خطأ: " + error.message);

    showToast(`🔄 تم الرجوع لديل العميل (${d.client_name}) وفتحه من جديد!`, "info");
    await loadAllData();
    openEditDeal(dealId);
}

function openNewDealModal() {
    renderWhatsappInstances();
    document.getElementById('dealForm').reset();
    document.getElementById('editDealId').value = "";
    document.getElementById('oldAmountPaid').value = "0";
    document.getElementById('amountPaid').disabled = false;
    document.getElementById('dealStatus').value = 'in_progress';
    document.getElementById('dealWhatsappInstance').value = '';
    selectWatchBrandOption('');
    document.getElementById('dealModalTitle').textContent = "تسجيل ديل / ساعة جديدة";
    document.getElementById('imagePreview').classList.add('hidden');
    compressedImageDataUrl = "";

    const myEmp = state.employees.find(e => e.user_id === currentUser.id);
    if (myEmp) document.getElementById('dealEmployee').value = myEmp.id;

    updateWhatsAppPreview();
    openModal('dealModal');
}

function openEditDeal(dealId) {
    renderWhatsappInstances();
    const d = state.deals.find(x => x.id === dealId);
    if (!d) return;

    document.getElementById('editDealId').value = d.id;
    document.getElementById('oldAmountPaid').value = d.amount_paid || 0;
    document.getElementById('dealModalTitle').textContent = `تخليص / تعديل ديل العميل: ${d.client_name}`;

    document.getElementById('clientName').value = d.client_name || '';
    document.getElementById('clientPhone').value = d.client_phone || '';
    document.getElementById('clientLocation').value = d.client_location || '';

    const savedBrand = d.watch_brand || '';
    if (!savedBrand || SWISS_BRANDS.includes(savedBrand)) {
        selectWatchBrandOption(savedBrand);
    } else {
        selectWatchBrandOption('custom', savedBrand);
    }

    const myEmp = state.employees.find(e => e.user_id === currentUser.id);
    document.getElementById('dealEmployee').value = d.employee_id || (myEmp ? myEmp.id : '');
    document.getElementById('dealWhatsappInstance').value = d.whatsapp_instance_id || '';

    document.getElementById('dealDetails').value = d.deal_details || '';
    document.getElementById('amountRequested').value = d.amount_requested || 0;
    document.getElementById('sellingPriceRange').value = d.selling_price_range || '';
    document.getElementById('amountPaid').value = d.amount_paid || 0;
    document.getElementById('dealStatus').value = d.status || 'in_progress';
    document.getElementById('amountPaid').disabled = (d.status === 'cancelled');
    document.getElementById('reminderMessage').value = d.reminder_message || '';

    if (d.meeting_time) {
        const dt = new Date(d.meeting_time);
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        document.getElementById('meetingTime').value = dt.toISOString().slice(0, 16);
    } else {
        document.getElementById('meetingTime').value = '';
    }

    if (d.item_image_url) {
        compressedImageDataUrl = d.item_image_url;
        const preview = document.getElementById('imagePreview');
        preview.src = d.item_image_url;
        preview.classList.remove('hidden');
    } else {
        compressedImageDataUrl = "";
        document.getElementById('imagePreview').classList.add('hidden');
    }

    updateWhatsAppPreview();
    openModal('dealModal');
}

async function saveDeal(e) {
    e.preventDefault();
    const editId = document.getElementById('editDealId').value;
    const oldPaid = Number(document.getElementById('oldAmountPaid').value || 0);
    let newPaid = Number(document.getElementById('amountPaid').value || 0);
    let status = document.getElementById('dealStatus').value;

    if (newPaid > 0 && status === 'in_progress') {
        status = 'completed';
        document.getElementById('dealStatus').value = 'completed';
    }
    if (status === 'completed' && newPaid <= 0) {
        document.getElementById('amountPaid').focus();
        return alert("⚠️ طالما اخترت (تم الشراء وتخليص الديل)، لازم تكتب في خانة (أنا دفعتله كام) المبلغ اللي اشتريت بيه!");
    }
    if (status === 'cancelled') {
        newPaid = 0;
    }

    const diffPaid = newPaid - oldPaid;

    if (diffPaid > 0) {
        const currentBalance = getCurrentTreasuryBalance();
        if (currentBalance < diffPaid) {
            return alert(`⚠️ الخزنة فاضية أو الرصيد غير كافي!\n\nالمبلغ المدفوع في الديل: ${diffPaid.toLocaleString()} ج.م\nالرصيد المتاح في الخزنة حالياً: ${currentBalance.toLocaleString()} ج.م\n\nخش ضيف فلوس في الخزنة الأول.`);
        }
    }

    const myEmp = state.employees.find(emp => emp.user_id === currentUser.id);
    const selectedEmpId = document.getElementById('dealEmployee').value || (myEmp ? myEmp.id : null);
    const selectedWaId = document.getElementById('dealWhatsappInstance').value;
    const watchBrand = getSelectedWatchBrand();

    const dealPayload = {
        employee_id: selectedEmpId,
        whatsapp_instance_id: selectedWaId ? Number(selectedWaId) : null,
        assigned_by_name: currentUser.full_name,
        assigned_by_role: currentUser.role,
        client_name: document.getElementById('clientName').value.trim(),
        client_phone: document.getElementById('clientPhone').value.trim(),
        client_location: document.getElementById('clientLocation').value.trim(),
        watch_brand: watchBrand || null,
        deal_details: document.getElementById('dealDetails').value.trim(),
        amount_paid: newPaid,
        amount_requested: Number(document.getElementById('amountRequested').value || 0),
        selling_price_range: document.getElementById('sellingPriceRange').value.trim() || null,
        meeting_time: document.getElementById('meetingTime').value || null,
        reminder_message: document.getElementById('reminderMessage').value.trim() || null,
        item_image_url: compressedImageDataUrl || null,
        status: status
    };

    let savedDealId = editId;

    if (editId) {
        const { error } = await db.from('deals').update(dealPayload).eq('id', editId);
        if (error) {
            delete dealPayload.assigned_by_name;
            delete dealPayload.assigned_by_role;
            const retry = await db.from('deals').update(dealPayload).eq('id', editId);
            if (retry.error) return alert("❌ خطأ أثناء تحديث الديل: " + retry.error.message);
        }
    } else {
        const { data: insertedDeal, error } = await db.from('deals').insert([dealPayload]).select().single();
        if (error) {
            delete dealPayload.assigned_by_name;
            delete dealPayload.assigned_by_role;
            const retry = await db.from('deals').insert([dealPayload]).select().single();
            if (retry.error) return alert("❌ خطأ أثناء حفظ الديل: " + retry.error.message);
            savedDealId = retry.data.id;
        } else {
            savedDealId = insertedDeal.id;
        }
    }

    if (diffPaid > 0) {
        await db.from('treasury_transactions').insert([{
            transaction_type: 'out',
            amount: diffPaid,
            description: `شراء وتخليص ديل (${watchBrand || 'ساعة'} - العميل: ${dealPayload.client_name}) - بواسطة: ${currentUser.full_name}`,
            related_deal_id: savedDealId
        }]);
    }

    showToast("✅ تم حفظ وتحديث بيانات الديل بنجاح!", "success");
    compressedImageDataUrl = "";
    document.getElementById('dealForm').reset();
    document.getElementById('imagePreview').classList.add('hidden');
    closeModal('dealModal');
    await loadAllData();
}

function renderDeals(query = '') {
    const tbody = document.getElementById('dealsTableBody');
    let list = state.deals;

    if (query) {
        const qLower = query.toLowerCase();
        list = list.filter(d =>
            (d.client_name && d.client_name.toLowerCase().includes(qLower)) ||
            (d.client_phone && d.client_phone.toLowerCase().includes(qLower)) ||
            (d.deal_details && d.deal_details.toLowerCase().includes(qLower)) ||
            (d.watch_brand && d.watch_brand.toLowerCase().includes(qLower)) ||
            (d.client_location && d.client_location.toLowerCase().includes(qLower))
        );
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">لا توجد صفقات مطابقة للبحث</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(d => {
        const emp = state.employees.find(e => e.id === d.employee_id);
        const waInst = state.waInstances.find(w => Number(w.id) === Number(d.whatsapp_instance_id));
        let badge = '';
        let rowBgClass = 'hover:bg-slate-50';
        let actionButtons = '';

        if (d.status === 'completed') {
            rowBgClass = 'bg-emerald-50/50 hover:bg-emerald-50';
            badge = `<span class="inline-block whitespace-nowrap bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-extrabold shadow-sm">✅ تم الشراء (Done)</span>`;
            actionButtons = `
                <div class="flex flex-col gap-1.5 items-start">
                    <span class="whitespace-nowrap text-xs font-extrabold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-300 w-full text-center">
                        ✔️ الديل منتهي (Done)
                    </span>
                    <button onclick="openEditDeal('${d.id}')" class="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg font-bold">✏️ تعديل الديل</button>
                    <button onclick="deleteRow('deals', '${d.id}')" class="w-full text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 px-2.5 py-1 rounded-lg font-bold">حذف</button>
                </div>`;
        } else if (d.status === 'cancelled') {
            rowBgClass = 'bg-rose-50/40 hover:bg-rose-50/70';
            badge = `<span class="inline-block whitespace-nowrap bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-1 rounded-full text-xs font-extrabold">❌ لم يتم الاتفاق</span>`;
            actionButtons = `
                <div class="flex flex-col gap-1.5">
                    <button onclick="reopenCancelledDeal('${d.id}')" class="whitespace-nowrap text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold shadow">
                        🔄 الرجوع للديل مرة أخرى
                    </button>
                    <button onclick="openEditDeal('${d.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold">✏️ تعديل البيانات</button>
                    <button onclick="deleteRow('deals', '${d.id}')" class="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 px-2.5 py-1 rounded-lg font-bold">حذف</button>
                </div>`;
        } else {
            badge = `<span class="inline-block whitespace-nowrap bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold">⏳ قيد التواصل</span>`;
            actionButtons = `
                <div class="flex flex-col gap-1.5">
                    <button onclick="openEditDeal('${d.id}')" class="whitespace-nowrap text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm">
                        ✏️ تخليص / تعديل الديل
                    </button>
                    <button onclick="deleteRow('deals', '${d.id}')" class="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 px-2.5 py-1 rounded-lg font-bold">حذف</button>
                </div>`;
        }

        const imageHtml = d.item_image_url
            ? `<div onclick="viewDealImage('${d.id}')" class="relative group cursor-pointer inline-block">
                 <img src="${d.item_image_url}" class="h-14 w-14 rounded-lg object-cover border-2 border-slate-300 group-hover:border-blue-500 transition">
                 <span class="block text-[10px] text-blue-600 font-bold text-center mt-0.5">🔍 تكبير</span>
               </div>`
            : '<span class="text-xs text-slate-400">لا توجد</span>';

        return `
        <tr class="${rowBgClass} transition">
            <td class="p-3.5">
                <div class="font-bold text-slate-900">${d.client_name}</div>
                <a href="https://wa.me/2${d.client_phone}" target="_blank" class="text-xs text-emerald-600 font-bold hover:underline">📱 ${d.client_phone}</a>
            </td>
            <td class="p-3.5">
                <div class="font-extrabold text-blue-800">${d.watch_brand ? '⌚ ' + d.watch_brand : '-'}</div>
                <div class="text-xs text-slate-500 mt-0.5">📍 ${d.client_location || 'غير محدد'}</div>
            </td>
            <td class="p-3.5 max-w-xs font-medium">${d.deal_details}</td>
            <td class="p-3.5 space-y-0.5">
                <div class="text-xs text-rose-600 font-bold">العميل طالب: ${Number(d.amount_requested || 0).toLocaleString()} ج.م</div>
                <div class="text-xs text-indigo-700 font-bold">رينج البيع: ${d.selling_price_range || 'غير محدد'}</div>
                <div class="text-xs text-emerald-700 font-bold">دفعتله: ${Number(d.amount_paid || 0).toLocaleString()} ج.م</div>
            </td>
            <td class="p-3.5 text-xs">
                <div class="font-semibold text-blue-700">${d.meeting_time ? new Date(d.meeting_time).toLocaleString('ar-EG') : 'غير محدد'}</div>
                <div class="text-[10px] text-slate-500 mt-0.5 font-bold">📲 خط الإرسال: ${waInst ? `${waInst.instance_name} (${waInst.phone_number})` : 'توزيع تلقائي'}</div>
                ${d.reminder_message ? `<div class="mt-1 text-[10px] bg-emerald-50 text-emerald-900 p-1.5 rounded border border-emerald-200 max-w-[180px] truncate" title="${d.reminder_message}">💬 ${d.reminder_message}</div>` : ''}
            </td>
            <td class="p-3.5">${imageHtml}</td>
            <td class="p-3.5">
                ${badge}
                <div class="text-xs text-slate-500 mt-1">${emp ? '👤 ' + emp.full_name : '<span class="text-amber-600">بدون موظف</span>'}</div>
            </td>
            <td class="p-3.5">${actionButtons}</td>
        </tr>`;
    }).join('');
}