window.addEventListener('DOMContentLoaded', () => {
    // إخفاء شاشة الـ Opening الملكية بنعومة بعد 2.3 ثانية
    const splash = document.getElementById('royalSplashScreen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('splash-fade-out');
            setTimeout(() => splash.remove(), 700);
        }, 2300);
    }

    try {
        if (typeof db !== 'undefined' && db) {
            const savedUser = sessionStorage.getItem('mrc_user') || localStorage.getItem('mrc_user');
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
                launchApp();
            }
        }
    } catch (err) {
        console.error("Init error:", err);
        sessionStorage.removeItem('mrc_user');
        localStorage.removeItem('mrc_user');
    }
});
async function handleSignIn(e) {
    if (e) e.preventDefault();

    if (typeof db === 'undefined' || !db) {
        alert("❌ لم يتم تحميل ملف الإعدادات (js/config.js)! تأكد من رفع فولدر js على GitHub.");
        return false;
    }

    const identifier = document.getElementById('loginIdentifier').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const submitBtn = document.getElementById('btnSignInSubmit');

    if (SYSTEM_LOCK_EMAILS.includes(identifier.toLowerCase())) {
        alert("❌ هذا سجل نظام داخلي لحفظ كلمات المرور فقط.");
        return false;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ جاري تسجيل الدخول...";
    }

    try {
        const { data: usersList, error } = await db
            .from('app_users')
            .select('*')
            .eq('password_hash', pass);

        if (error || !usersList) {
            alert("❌ خطأ في الاتصال بقاعدة البيانات: " + (error ? error.message : ''));
            return false;
        }

        const matchedUser = usersList.find(u =>
            !SYSTEM_LOCK_EMAILS.includes(u.email) &&
            ((u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
             (u.full_name && u.full_name.toLowerCase() === identifier.toLowerCase()))
        );

        if (!matchedUser) {
            alert("❌ اسم المستخدم/الإيميل أو كلمة المرور غير صحيحة!");
            return false;
        }

        currentUser = matchedUser;
        isTreasuryUnlocked = false;
        isWhatsappUnlocked = false;
        sessionStorage.setItem('mrc_user', JSON.stringify(matchedUser));
        await launchApp();
    } catch (err) {
        alert("❌ حدث خطأ أثناء الدخول: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "دخول للنظام";
        }
    }
    return false;
}

function logout() {
    sessionStorage.removeItem('mrc_user');
    localStorage.removeItem('mrc_user');
    currentUser = null;
    isTreasuryUnlocked = false;
    isWhatsappUnlocked = false;
    selectedEmployeeHistoryId = null;
    selectedWaInstanceId = null;
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
}

async function launchApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');

    document.getElementById('currentUserName').textContent = currentUser.full_name;
    const roleNames = { owner: '👑 الأونر (Full Admin)', employee: '💼 موظف' };
    document.getElementById('currentUserRoleBadge').textContent = roleNames[currentUser.role] || 'موظف';

    document.querySelectorAll('.owner-only').forEach(el => el.classList.toggle('hidden', currentUser.role !== 'owner'));

    switchPage('deals');
    await loadAllData();
}

async function loadAllData() {
    if (!db || !currentUser) return;
    try {
        const [empRes, dealRes, finRes, trRes, usrRes, waRes] = await Promise.all([
            db.from('employees').select('*').order('created_at', { ascending: false }),
            db.from('deals').select('*').order('created_at', { ascending: false }),
            db.from('employee_financials').select('*').order('transaction_date', { ascending: false }),
            db.from('treasury_transactions').select('*').order('transaction_date', { ascending: false }),
            db.from('app_users').select('*').order('created_at', { ascending: false }),
            db.from('whatsapp_instances').select('*').order('id', { ascending: true })
        ]);

        state.employees = empRes.data || [];
        state.deals = dealRes.data || [];
        state.empFinancials = finRes.data || [];
        state.treasury = trRes.data || [];
        state.users = usrRes.data || [];
        state.waInstances = waRes.data || [];

        renderAll();
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function renderAll() {
    if (!currentUser) return;
    if (typeof renderWhatsappInstances === 'function') renderWhatsappInstances();
    if (typeof renderDeals === 'function') {
        const searchInput = document.getElementById('dealSearchInput');
        renderDeals(searchInput ? searchInput.value : '');
    }
    if (typeof renderEmployees === 'function') renderEmployees();
    if (typeof renderTreasury === 'function') renderTreasury();
    if (typeof renderUsers === 'function') renderUsers();
}

function openProfileModal() {
    document.getElementById('profName').value = currentUser.full_name || '';
    document.getElementById('profEmail').value = (currentUser.email && !currentUser.email.endsWith('@mrc.local')) ? currentUser.email : '';
    document.getElementById('profPhone').value = currentUser.phone || '';
    document.getElementById('profPassword').value = currentUser.password_hash || '';
    openModal('profileModal');
}

async function saveProfileSettings(e) {
    e.preventDefault();
    const full_name = document.getElementById('profName').value.trim();
    const rawEmail = document.getElementById('profEmail').value.trim();
    const email = rawEmail || `${full_name.replace(/\s+/g, '_')}_${Date.now()}@mrc.local`;
    const phone = document.getElementById('profPhone').value.trim();
    const password_hash = document.getElementById('profPassword').value.trim();

    if (!phone) return alert("⚠️ رقم التليفون / الواتساب مطلوب!");

    const { data: updatedUser, error } = await db
        .from('app_users')
        .update({ full_name, email, phone, password_hash })
        .eq('id', currentUser.id)
        .select()
        .single();

    if (error) return alert("❌ خطأ أثناء حفظ الإعدادات: " + error.message);

    const myEmp = state.employees.find(emp => emp.user_id === currentUser.id);
    if (myEmp) {
        await db.from('employees').update({ full_name, phone_whatsapp: phone }).eq('id', myEmp.id);
    }

    currentUser = updatedUser;
    sessionStorage.setItem('mrc_user', JSON.stringify(updatedUser));
    document.getElementById('currentUserName').textContent = updatedUser.full_name;
    closeModal('profileModal');
    showToast("✅ تم حفظ بياناتك وكلمة المرور الجديدة في قاعدة البيانات!", "success");
    await loadAllData();
}

function renderUsers() {
    const visibleUsers = state.users.filter(u => !SYSTEM_LOCK_EMAILS.includes(u.email));
    document.getElementById('usersTableBody').innerHTML = visibleUsers.map(u => `
        <tr>
            <td class="p-3 font-bold">${u.full_name}</td>
            <td class="p-3">${u.email && !u.email.endsWith('@mrc.local') ? u.email : '<span class="text-xs text-slate-400">يدخل بالاسم فقط</span>'}</td>
            <td class="p-3 font-semibold text-emerald-700">${u.phone || '-'}</td>
            <td class="p-3 font-bold">${u.role === 'owner' ? '<span class="bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full text-xs">👑 أونر</span>' : '<span class="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs">💼 موظف</span>'}</td>
            <td class="p-3 text-xs">${new Date(u.created_at).toLocaleString('ar-EG')}</td>
            <td class="p-3">${u.role !== 'owner' ? `<button onclick="deleteRow('app_users', '${u.id}')" class="text-xs bg-rose-100 text-rose-700 px-2 py-1 rounded font-bold">حذف الحساب</button>` : '-'}</td>
        </tr>
    `).join('');
}