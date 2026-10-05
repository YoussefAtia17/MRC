// =========================================================================
// إدارة الخزنة وأرقام واتساب الشركة (Treasury & WhatsApp Senders Module)
// =========================================================================

// 1. حماية وإدارة أرقام واتساب الشركة
function getSavedWhatsappPassword() {
    const lockRecord = state.users.find(u => u.email === 'whatsapp@mrc.lock');
    return lockRecord ? lockRecord.password_hash : '1234';
}

function requestWhatsappAccess() {
    if (isWhatsappUnlocked) {
        switchPage('whatsapp');
    } else {
        document.getElementById('waPassInput').value = '';
        openModal('waPasswordModal');
        setTimeout(() => document.getElementById('waPassInput').focus(), 100);
    }
}

async function verifyWhatsappPassword(e) {
    e.preventDefault();
    await loadAllData();
    const entered = document.getElementById('waPassInput').value.trim();
    const correctPass = getSavedWhatsappPassword();
    const ownerAccount = state.users.find(u => u.role === 'owner');
    const ownerLoginPass = ownerAccount ? ownerAccount.password_hash : null;

    if (entered === correctPass || (ownerLoginPass && entered === ownerLoginPass)) {
        isWhatsappUnlocked = true;
        closeModal('waPasswordModal');
        switchPage('whatsapp');
        renderWhatsappInstances();
        showToast("🔓 تم فتح صفحة أرقام الواتساب بنجاح", "success");
    } else {
        alert("❌ باسورد أرقام الواتساب غير صحيح!");
    }
}

function lockWhatsappPage() {
    isWhatsappUnlocked = false;
    selectedWaInstanceId = null;
    switchPage('deals');
    showToast("🔒 تم قفل صفحة أرقام الواتساب", "info");
}

async function saveNewWhatsappPassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('newWaPass').value.trim();
    const existingLock = state.users.find(u => u.email === 'whatsapp@mrc.lock');

    if (existingLock) {
        await db.from('app_users').update({ password_hash: newPass }).eq('id', existingLock.id);
    } else {
        await db.from('app_users').insert([{
            full_name: 'قفل أرقام الواتساب',
            email: 'whatsapp@mrc.lock',
            phone: '0000',
            password_hash: newPass,
            role: 'user'
        }]);
    }

    closeModal('changeWaPassModal');
    showToast("🔑 تم تغيير باسورد أرقام الواتساب بنجاح!", "success");
    await loadAllData();
}

async function saveWhatsappInstance(e) {
    e.preventDefault();
    const instance_name = document.getElementById('waInstanceName').value.trim();
    const phone_number = document.getElementById('waPhoneNumber').value.trim();
    const status = document.getElementById('waStatus').value;

    const { error } = await db.from('whatsapp_instances').insert([{
        instance_name,
        phone_number,
        status
    }]);

    if (error) {
        return alert("❌ خطأ في حفظ رقم الشركة: " + error.message);
    }

    showToast(`📱 تم إضافة خط واتساب الشركة (${instance_name} - ${phone_number}) وظهوره في قائمة الديل!`, 'success');
    e.target.reset();
    closeModal('addWhatsappModal');
    await loadAllData();
}

async function toggleWaInstanceStatus(id, currentStatus) {
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';
    await db.from('whatsapp_instances').update({ status: newStatus }).eq('id', id);
    await loadAllData();
}

function toggleWaCardDeals(waId, event) {
    if (event) event.stopPropagation();
    if (Number(selectedWaInstanceId) === Number(waId)) {
        closeWaDealsHistory();
    } else {
        selectedWaInstanceId = waId;
        renderWhatsappInstances();
    }
}

function closeWaDealsHistory() {
    selectedWaInstanceId = null;
    const box = document.getElementById('selectedWaDealsBox');
    if (box) box.classList.add('hidden');
    renderWhatsappInstances();
}

function renderWhatsappInstances() {
    const connectedNumbers = state.waInstances.filter(w => w.status === 'connected');
    let waSelectHtml = `<option value="">🔄 توزيع تلقائي ذكي بين أرقام الشركة (${connectedNumbers.length} متصل)</option>`;
    waSelectHtml += state.waInstances.map(w => `
        <option value="${w.id}">📱 ${w.instance_name} - (${w.phone_number}) ${w.status === 'connected' ? '🟢' : '🔴'}</option>
    `).join('');
    const dealWaSelect = document.getElementById('dealWhatsappInstance');
    if (dealWaSelect) dealWaSelect.innerHTML = waSelectHtml;

    const grid = document.getElementById('waInstancesGrid');
    if (!grid) return;

    if (state.waInstances.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white p-8 rounded-2xl border text-center text-slate-400">
                لا توجد أرقام واتساب مضافة للشركة حالياً. اضغط على (+ إضافة رقم واتساب للشركة) ليظهر لك هنا وفي نافذة الديل.
            </div>`;
        return;
    }

    grid.innerHTML = state.waInstances.map((w, idx) => {
        const isConn = w.status === 'connected';
        const linkedDeals = state.deals.filter(d => Number(d.whatsapp_instance_id) === Number(w.id));
        const isSelected = Number(selectedWaInstanceId) === Number(w.id);

        return `
        <div onclick="toggleWaCardDeals(${w.id}, event)"
             class="wa-card-item cursor-pointer bg-white p-5 rounded-2xl shadow-sm border-2 transition ${isSelected ? 'border-emerald-600 ring-4 ring-emerald-200 bg-emerald-50/20' : (isConn ? 'border-emerald-500/60 hover:border-emerald-600' : 'border-rose-300 bg-rose-50/20')} flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start">
                    <span class="bg-slate-900 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg">خط شركة #${idx + 1}</span>
                    <span class="text-xs font-extrabold px-2.5 py-1 rounded-full ${isConn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                        ${isConn ? '🟢 متصل (Connected)' : '🔴 فاصل (Disconnected)'}
                    </span>
                </div>
                <div class="flex justify-between items-center mt-3">
                    <h3 class="font-extrabold text-base text-slate-900">${w.instance_name}</h3>
                    <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">
                        ${isSelected ? '▼ الصفقات مفتوحة' : '▶ عرض الصفقات (' + linkedDeals.length + ')'}
                    </span>
                </div>
                <p class="text-sm text-emerald-700 font-bold mt-1">📱 ${w.phone_number}</p>
                <p class="text-[11px] text-slate-500 mt-2 font-semibold">📋 عدد الـ Deals المربوطة بالرقم: <b class="text-slate-900">${linkedDeals.length} ديل</b></p>
            </div>
            <div class="flex justify-between items-center gap-2 mt-4 pt-3 border-t" onclick="event.stopPropagation()">
                <button onclick="toggleWaInstanceStatus(${w.id}, '${w.status}')" class="text-xs font-bold px-3 py-1.5 rounded-lg ${isConn ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}">
                    ${isConn ? 'تعطيل مؤقت' : 'تفعيل كمتصل'}
                </button>
                <button onclick="deleteRow('whatsapp_instances', ${w.id})" class="text-xs bg-rose-100 text-rose-700 hover:bg-rose-200 px-3 py-1.5 rounded-lg font-bold">
                    حذف الرقم
                </button>
            </div>
        </div>`;
    }).join('');

    const dealsBox = document.getElementById('selectedWaDealsBox');
    const dealsTbody = document.getElementById('waLinkedDealsTableBody');
    if (selectedWaInstanceId && dealsBox && dealsTbody) {
        const selectedWa = state.waInstances.find(w => Number(w.id) === Number(selectedWaInstanceId));
        if (selectedWa) {
            dealsBox.classList.remove('hidden');
            document.getElementById('selectedWaDealsTitle').textContent = `📱 الصفقات المربوطة بخط: ${selectedWa.instance_name} (${selectedWa.phone_number})`;
            const linkedDeals = state.deals.filter(d => Number(d.whatsapp_instance_id) === Number(selectedWaInstanceId));

            if (linkedDeals.length === 0) {
                dealsTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">لا توجد صفقات مربوطة بهذا الرقم حتى الآن</td></tr>`;
            } else {
                dealsTbody.innerHTML = linkedDeals.map(d => {
                    const emp = state.employees.find(e => e.id === d.employee_id);
                    const linkedUser = emp ? state.users.find(u => u.id === emp.user_id) : null;

                    const personName = d.assigned_by_name || (emp ? emp.full_name : 'غير محدد');
                    const personRole = d.assigned_by_role || (linkedUser ? linkedUser.role : 'employee');

                    const roleBadge = personRole === 'owner'
                        ? `<span class="inline-block whitespace-nowrap bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold">👑 أونر: ${personName}</span>`
                        : `<span class="inline-block whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">💼 موظف: ${personName}</span>`;

                    let statusBadge = `<span class="inline-block whitespace-nowrap bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-bold">⏳ قيد التواصل</span>`;
                    if (d.status === 'completed') statusBadge = `<span class="inline-block whitespace-nowrap bg-emerald-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">✅ تم الشراء (Done)</span>`;
                    else if (d.status === 'cancelled') statusBadge = `<span class="inline-block whitespace-nowrap bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-xs font-bold">❌ لم يتم الاتفاق</span>`;

                    return `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3">
                            <div class="font-bold text-slate-900">${d.client_name}</div>
                            <div class="text-xs text-emerald-600 font-bold">📱 ${d.client_phone}</div>
                        </td>
                        <td class="p-3">
                            <div class="font-extrabold text-blue-800 text-xs">${d.watch_brand ? '⌚ ' + d.watch_brand : '-'}</div>
                            <div class="text-xs text-slate-600 mt-0.5">${d.deal_details}</div>
                        </td>
                        <td class="p-3">
                            ${roleBadge}
                            ${emp && d.assigned_by_name && emp.full_name !== d.assigned_by_name ? `<div class="text-[10px] text-slate-500 mt-1">مسؤول الديل: ${emp.full_name}</div>` : ''}
                        </td>
                        <td class="p-3 text-xs font-semibold text-blue-700">
                            ${d.meeting_time ? new Date(d.meeting_time).toLocaleString('ar-EG') : 'غير محدد'}
                        </td>
                        <td class="p-3">${statusBadge}</td>
                        <td class="p-3">
                            <button onclick="openEditDeal('${d.id}')" class="whitespace-nowrap text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg font-bold">
                                ✏️ فتح الديل
                            </button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }
    } else if (dealsBox) {
        dealsBox.classList.add('hidden');
    }
}

// =========================================================================
// 2. إدارة وحماية الخزنة والتقفيل اليومي والشهري
// =========================================================================
function getSavedTreasuryPassword() {
    const lockRecord = state.users.find(u => u.email === 'treasury@mrc.lock');
    return lockRecord ? lockRecord.password_hash : '1234';
}

function requestTreasuryAccess() {
    if (isTreasuryUnlocked) {
        switchPage('treasury');
    } else {
        document.getElementById('treasuryPassInput').value = '';
        openModal('treasuryPasswordModal');
        setTimeout(() => document.getElementById('treasuryPassInput').focus(), 100);
    }
}

async function verifyTreasuryPassword(e) {
    e.preventDefault();
    await loadAllData();
    const entered = document.getElementById('treasuryPassInput').value.trim();
    const correctPass = getSavedTreasuryPassword();
    const ownerAccount = state.users.find(u => u.role === 'owner');
    const ownerLoginPass = ownerAccount ? ownerAccount.password_hash : null;

    if (entered === correctPass || (ownerLoginPass && entered === ownerLoginPass)) {
        isTreasuryUnlocked = true;
        closeModal('treasuryPasswordModal');
        switchPage('treasury');
        renderTreasury();
        showToast("🔓 تم فتح الخزنة بنجاح", "success");
    } else {
        alert("❌ باسورد الخزنة غير صحيح!");
    }
}

function lockTreasury() {
    isTreasuryUnlocked = false;
    switchPage('deals');
    showToast("🔒 تم قفل الخزنة", "info");
}

async function saveNewTreasuryPassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('newTreasuryPass').value.trim();
    const existingLock = state.users.find(u => u.email === 'treasury@mrc.lock');

    if (existingLock) {
        await db.from('app_users').update({ password_hash: newPass }).eq('id', existingLock.id);
    } else {
        await db.from('app_users').insert([{
            full_name: 'قفل الخزنة',
            email: 'treasury@mrc.lock',
            phone: '0000',
            password_hash: newPass,
            role: 'user'
        }]);
    }

    closeModal('changeTreasuryPassModal');
    showToast("🔑 تم تغيير باسورد الخزنة بنجاح!", "success");
    await loadAllData();
}

async function saveTreasuryTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('trType').value;
    const amount = Number(document.getElementById('trAmount').value);
    const desc = document.getElementById('trDesc').value.trim();

    if (type === 'out') {
        const currentBalance = getCurrentTreasuryBalance();
        if (currentBalance < amount) {
            return alert(`⚠️ لا يمكن صرف هذا المبلغ لأن رصيد الخزنة غير كافي!\n\nالمبلغ المراد صرفه: ${amount.toLocaleString()} ج.م\nالرصيد المتاح في الخزنة: ${currentBalance.toLocaleString()} ج.م`);
        }
    }

    const { error } = await db.from('treasury_transactions').insert([{
        transaction_type: type,
        amount: amount,
        description: desc
    }]);
    if (error) return alert("❌ خطأ: " + error.message);
    e.target.reset();
    closeModal('treasuryModal');
    showToast("تم تسجيل الحركة في الخزنة بنجاح!", "success");
    await loadAllData();
}

function renderTreasury() {
    const filter = document.getElementById('treasuryFilter').value;
    let dIn = 0, dOut = 0, mIn = 0, mOut = 0;

    state.treasury.forEach(t => {
        const amt = Number(t.amount || 0);
        const tDate = t.transaction_date || t.created_at;
        const isToday = isSameLocalDay(tDate);
        const isMonth = isSameLocalMonth(tDate);

        if (t.transaction_type === 'in') {
            if (isMonth) mIn += amt;
            if (isToday) dIn += amt;
        } else {
            if (isMonth) mOut += amt;
            if (isToday) dOut += amt;
        }
    });

    document.getElementById('dailyIn').textContent = dIn.toLocaleString() + ' ج.م';
    document.getElementById('dailyOut').textContent = dOut.toLocaleString() + ' ج.م';
    document.getElementById('dailyNet').textContent = (dIn - dOut).toLocaleString() + ' ج.م';

    document.getElementById('monthlyIn').textContent = mIn.toLocaleString() + ' ج.م';
    document.getElementById('monthlyOut').textContent = mOut.toLocaleString() + ' ج.م';
    document.getElementById('monthlyNet').textContent = getCurrentTreasuryBalance().toLocaleString() + ' ج.م';

    const list = state.treasury.filter(t => {
        const tDate = t.transaction_date || t.created_at;
        if (filter === 'today') return isSameLocalDay(tDate);
        if (filter === 'month') return isSameLocalMonth(tDate);
        if (filter === 'in') return t.transaction_type === 'in';
        if (filter === 'out') return t.transaction_type === 'out';
        return true;
    });

    if (list.length === 0) {
        document.getElementById('treasuryTableBody').innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">لا توجد حركات مسجلة في هذا التصنيف</td></tr>`;
        return;
    }

    document.getElementById('treasuryTableBody').innerHTML = list.map(t => `
        <tr>
            <td class="p-3.5 font-bold ${t.transaction_type === 'in' ? 'text-emerald-600' : 'text-rose-600'}">${t.transaction_type === 'in' ? '🟢 دخلت الخزنة' : '🔴 اتصرفت من الخزنة'}</td>
            <td class="p-3.5 font-extrabold">${Number(t.amount).toLocaleString()} ج.م</td>
            <td class="p-3.5">${t.description}</td>
            <td class="p-3.5 text-xs">${new Date(t.transaction_date || t.created_at).toLocaleString('ar-EG')}</td>
            <td class="p-3.5 ${currentUser.role === 'owner' ? '' : 'hidden'}">
                <button onclick="deleteRow('treasury_transactions', '${t.id}')" class="text-xs bg-rose-100 text-rose-700 px-2 py-1 rounded font-bold">حذف</button>
            </td>
        </tr>
    `).join('');
}