// =========================================================================
// إدارة الأونرز، الموظفين، السلف الفورية، والبونص (مع التصفير الشهري التلقائي من يوم الإضافة)
// =========================================================================

function toggleSalaryFieldByRole(role) {
    document.getElementById('empSalaryWrapper').classList.toggle('hidden', role === 'owner');
}

// فتح نافذة إضافة حساب بخانات فاضية دايماً (من غير بيانات حد سجل قبل كده أو حفظها المتصفح)
function clearAddEmployeeForm() {
    document.getElementById('addEmployeeForm').reset();
    ['empName', 'empPhone', 'empPassword', 'empEmail'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('empSalary').value = 0;
    toggleSalaryFieldByRole(document.getElementById('empRole').value);
}

function openAddEmployeeModal() {
    clearAddEmployeeForm();
    openModal('addEmployeeModal');
    // المتصفح أحياناً بيملا الخانات بعد ما النافذة تفتح، فبنفضّيها تاني
    [50, 300].forEach(ms => setTimeout(() => {
        if (document.activeElement?.closest('#addEmployeeForm')) return;
        clearAddEmployeeForm();
    }, ms));
}

// حساب بداية دورة الشهر الحالية للموظف بناءً على يوم إضافته (created_at)
function getEmployeeCycleStartDate(empCreatedAt) {
    const now = new Date();
    const createdDate = empCreatedAt ? new Date(empCreatedAt) : new Date(now.getFullYear(), now.getMonth(), 1);
    const hireDay = createdDate.getDate(); // اليوم اللي اتضاف فيه الموظف (مثلاً يوم 6)

    // بداية الدورة في الشهر الحالي بنفس يوم الإضافة
    let cycleStart = new Date(now.getFullYear(), now.getMonth(), hireDay, 0, 0, 0);

    // لو النهاردة لسه مجاش يوم الإضافة في الشهر ده، تبقى الدورة الحالية بدأت من الشهر اللي فات في نفس اليوم
    if (now < cycleStart) {
        cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, hireDay, 0, 0, 0);
    }

    return cycleStart;
}

async function ownerCreateEmployee(e) {
    e.preventDefault();
    const role = document.getElementById('empRole').value;
    const full_name = document.getElementById('empName').value.trim();
    const phone_whatsapp = document.getElementById('empPhone').value.trim();
    const password = document.getElementById('empPassword').value.trim();

    if (!full_name || !phone_whatsapp || !password) {
        return alert("⚠️ الاسم، رقم التليفون (الواتساب)، والباسورد خانات إجبارية!");
    }

    const rawEmail = document.getElementById('empEmail').value.trim();
    const email = rawEmail || `${full_name.replace(/\s+/g, '_')}_${Date.now()}@mrc.local`;
    const base_salary = role === 'owner' ? 0 : Number(document.getElementById('empSalary').value || 0);

    // الحساب وكارت الموظف بيتعملوا مع بعض على السيرفر، والباسورد بيتشفر هناك
    const { error } = await db.rpc('app_create_user', {
        p_full_name: full_name, p_email: email, p_phone: phone_whatsapp,
        p_password: password, p_role: role, p_base_salary: base_salary
    });

    if (error) return alert("❌ خطأ في إنشاء الحساب: " + error.message);

    showToast(`✅ تم إنشاء حساب (${esc(full_name)}) بصلاحية (${role === 'owner' ? '👑 أونر' : '💼 موظف'}) بنجاح!`, 'success');
    e.target.reset();
    closeModal('addEmployeeModal');
    await loadAllData();
}

// الحذف = أرشفة: الموظف بيختفي من القوائم ومايقدرش يدخل، لكن كل معاملاته بتفضل في السجل
async function deleteEmployeeAndUser(empId, userId) {
    if (!confirm("الموظف هيتشال من القائمة ومش هيقدر يسجل دخول.\nكل سلفه وبونصاته وديلزه وحركات الخزنة بتاعته هتفضل محفوظة، وتقدر ترجّعه في أي وقت من (الموظفين المحذوفين).\n\nتكمل؟")) return;
    const { error } = empId
        ? await db.rpc('app_archive_employee', { p_emp_id: empId })
        : await db.rpc('app_delete_user', { p_user_id: userId });
    if (error) return alert("❌ لا يمكن حذف هذا الحساب: " + error.message);
    if (selectedEmployeeHistoryId === empId) selectedEmployeeHistoryId = null;
    showToast("🗂️ تم حذف الموظف من القائمة، ومعاملاته محفوظة في السجل.", "info");
    await loadAllData();
}

async function restoreEmployee(empId) {
    const { error } = await db.rpc('app_restore_employee', { p_emp_id: empId });
    if (error) return alert("❌ لا يمكن استرجاع الموظف: " + error.message);
    const emp = state.employees.find(e => e.id === empId);
    showToast(`♻️ تم استرجاع (${esc(emp ? emp.full_name : '')}) بكل معاملاته، ويقدر يسجل دخول تاني.`, "success");
    await loadAllData();
}

function toggleEmployeeCardHistory(empId, event) {
    if (event) event.stopPropagation();
    if (selectedEmployeeHistoryId === empId) {
        closeEmployeeHistory();
    } else {
        selectedEmployeeHistoryId = empId;
        renderEmployees();
    }
}

function closeEmployeeHistory() {
    selectedEmployeeHistoryId = null;
    document.getElementById('selectedEmployeeHistoryBox').classList.add('hidden');
    renderEmployees();
}

function openEmpFinancialModal() {
    const myEmp = state.employees.find(e => e.user_id === currentUser.id);
    const empSelect = document.getElementById('finEmpId');
    if (currentUser.role === 'employee' && myEmp) {
        empSelect.value = myEmp.id;
        empSelect.disabled = true;
        document.getElementById('finType').value = 'loan';
    } else {
        empSelect.disabled = false;
    }
    openModal('empFinancialModal');
}

async function saveEmpFinancial(e) {
    e.preventDefault();
    const employee_id = document.getElementById('finEmpId').value;
    const transaction_type = document.getElementById('finType').value;
    const amount = Number(document.getElementById('finAmount').value);
    const notes = document.getElementById('finNotes').value.trim();

    const currentBalance = getCurrentTreasuryBalance();
    const typeLabel = transaction_type === 'loan' ? 'السلفة' : 'البونص';

    // الرصيد بيتشيّك على السيرفر دايماً، وهنا بس لو الخزنة مفتوحة عشان رسالة أوضح
    if (isTreasuryUnlocked && currentBalance < amount) {
        return alert(`⚠️ الخزنة فاضية أو الرصيد غير كافي لصرف ${typeLabel}!\n\nالمبلغ المطلوب: ${amount.toLocaleString()} ج.م\nالرصيد المتاح في الخزنة حالياً: ${currentBalance.toLocaleString()} ج.م\n\nخش ضيف فلوس في الخزنة الأول.`);
    }

    const { error } = await db
        .from('employee_financials')
        .insert([{
            employee_id,
            transaction_type,
            amount,
            notes,
            approval_status: 'approved'
        }]);

    if (error) return alert("❌ خطأ أثناء التسجيل: " + error.message);


    selectedEmployeeHistoryId = employee_id;
    showToast(`تم تسجيل ${typeLabel} بمبلغ ${amount.toLocaleString()} ج.م وخصمها من الخزنة فوراً!`, "success");
    e.target.reset();
    closeModal('empFinancialModal');
    await loadAllData();
}

function renderEmployees() {
    const activeEmployees = state.employees.filter(e => !e.archived_at);
    const archivedEmployees = state.employees.filter(e => e.archived_at);
    const opts = activeEmployees.map(e => `<option value="${e.id}">${esc(e.full_name)}</option>`).join('');
    // المحذوفين بيظهروا (من غير ما يتختاروا) عشان الديلز القديمة تفضل محتفظة باسم مسؤولها
    const archivedOpts = archivedEmployees.map(e => `<option value="${e.id}" disabled>${esc(e.full_name)} (محذوف)</option>`).join('');
    document.getElementById('dealEmployee').innerHTML = `<option value="">-- اختر المسؤول --</option>` + opts + archivedOpts;
    document.getElementById('finEmpId').innerHTML = opts;

    const sortedList = [...activeEmployees].sort((a, b) => {
        const uA = state.users.find(u => u.id === a.user_id);
        const uB = state.users.find(u => u.id === b.user_id);
        const roleA = uA ? uA.role : 'employee';
        const roleB = uB ? uB.role : 'employee';
        return roleA === 'owner' && roleB !== 'owner' ? -1 : 1;
    });

    document.getElementById('employeesCardsContainer').innerHTML = sortedList.map(emp => {
        const linkedUser = state.users.find(u => u.id === emp.user_id);
        const isOwnerCard = linkedUser && linkedUser.role === 'owner';

        // حساب بداية الدورة الشهرية للموظف من يوم إضافته
        const cycleStart = getEmployeeCycleStartDate(emp.created_at);
        const nextResetDate = new Date(cycleStart);
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);
        const hireDay = cycleStart.getDate();

        const allRecs = state.empFinancials.filter(f => f.employee_id === emp.id);
        // فلترة السلف والبونص الخاصة بدورة الشهر الحالية فقط (تتصفر تلقائياً كل شهر في يوم إضافته)
        const currentCycleRecs = allRecs.filter(f => new Date(f.transaction_date || f.created_at) >= cycleStart);

        const loans = currentCycleRecs.filter(f => f.transaction_type === 'loan').reduce((s, f) => s + Number(f.amount), 0);
        const bonus = currentCycleRecs.filter(f => f.transaction_type === 'bonus').reduce((s, f) => s + Number(f.amount), 0);
        const net = Number(emp.base_salary) + bonus - loans;
        const isSelected = selectedEmployeeHistoryId === emp.id;

        if (isOwnerCard) {
            return `
            <div onclick="toggleEmployeeCardHistory('${emp.id}', event)"
                 class="emp-card-item cursor-pointer bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-lg border-2 transition ${isSelected ? 'border-amber-400 ring-4 ring-amber-300/40' : 'border-amber-500/80 hover:border-amber-400'}">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="inline-block bg-amber-500 text-slate-950 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full mb-1.5 shadow">
                            👑 حساب أونر (Owner)
                        </span>
                        <h3 class="font-extrabold text-base text-amber-300 flex items-center gap-2">
                            <span>${esc(emp.full_name)}</span>
                            <span class="text-[11px] px-2.5 py-0.5 rounded-full ${isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-amber-200'}">
                                ${isSelected ? '▼ السجل مفتوح' : '▶ عرض السجل (' + allRecs.length + ')'}
                            </span>
                        </h3>
                        <p class="text-xs text-slate-300 mt-1">📱 واتساب: <b>${esc(emp.phone_whatsapp) || 'غير مسجل'}</b></p>
                    </div>
                    ${currentUser.role === 'owner' && emp.user_id !== currentUser.id ? `
                        <button onclick="event.stopPropagation(); deleteEmployeeAndUser('${emp.id}', '${emp.user_id || ''}')" class="text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-600 hover:text-white px-2.5 py-1 rounded-lg font-bold">حذف</button>
                    ` : ''}
                </div>
                <div class="mt-4 space-y-1 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-700">
                    <div class="flex justify-between text-slate-300"><span>الصلاحية:</span><b class="text-amber-400">تحكم كامل في النظام والخزنة</b></div>
                    <div class="flex justify-between text-emerald-400"><span>مكافآت الدورة الحالية:</span><b>${bonus.toLocaleString()} ج.م</b></div>
                    <div class="flex justify-between text-rose-400"><span>مسحوبات الدورة الحالية:</span><b>${loans.toLocaleString()} ج.م</b></div>
                </div>
            </div>`;
        }

        return `
        <div onclick="toggleEmployeeCardHistory('${emp.id}', event)"
             class="emp-card-item cursor-pointer bg-white p-5 rounded-2xl shadow-sm border-2 transition ${isSelected ? 'border-blue-600 ring-2 ring-blue-200 bg-blue-50/20' : 'border-slate-200 hover:border-blue-400'}">
            <div class="flex justify-between items-start">
                <div>
                    <span class="inline-block bg-blue-100 text-blue-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full mb-1.5">
                        💼 موظف (يتجدد يوم ${hireDay} شهرياً)
                    </span>
                    <h3 class="font-bold text-base text-slate-900 flex items-center gap-1.5">
                        <span>${esc(emp.full_name)}</span>
                        <span class="text-[11px] px-2.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}">
                            ${isSelected ? '▼ السجل مفتوح' : '▶ عرض السجل (' + allRecs.length + ')'}
                        </span>
                    </h3>
                    <p class="text-xs text-slate-500 mt-1">📱 واتساب: <b>${esc(emp.phone_whatsapp) || 'غير مسجل'}</b></p>
                </div>
                ${currentUser.role === 'owner' ? `<button onclick="event.stopPropagation(); deleteEmployeeAndUser('${emp.id}', '${emp.user_id || ''}')" class="text-xs text-rose-600 font-bold hover:underline">حذف</button>` : ''}
            </div>
            <div class="mt-3 space-y-1 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div class="flex justify-between"><span>المرتب الأساسي:</span><b>${Number(emp.base_salary).toLocaleString()} ج.م</b></div>
                <div class="flex justify-between text-emerald-700"><span>+ إجمالي البونص (الشهر الحالي):</span><b>${bonus.toLocaleString()} ج.م</b></div>
                <div class="flex justify-between text-rose-600"><span>- إجمالي السلف (الشهر الحالي):</span><b>${loans.toLocaleString()} ج.م</b></div>
                <div class="border-t pt-1.5 flex justify-between font-extrabold text-blue-700"><span>صافي المرتب:</span><span>${net.toLocaleString()} ج.م</span></div>
                <div class="text-[10px] text-slate-400 pt-1 text-center font-semibold">
                    🔄 يتصفر تلقائياً ويعود للمرتب الأساسي يوم: ${nextResetDate.toLocaleDateString('ar-EG')}
                </div>
            </div>
        </div>`;
    }).join('');

    renderArchivedEmployees(archivedEmployees);

    const historyBox = document.getElementById('selectedEmployeeHistoryBox');
    if (selectedEmployeeHistoryId) {
        const selectedEmp = state.employees.find(e => e.id === selectedEmployeeHistoryId);
        if (selectedEmp) {
            const cycleStart = getEmployeeCycleStartDate(selectedEmp.created_at);
            historyBox.classList.remove('hidden');
            document.getElementById('selectedEmpHistoryTitle').textContent = `📅 سجل السلف والبونص الخاص بـ: (${selectedEmp.full_name})${selectedEmp.archived_at ? ' — 🗂️ محذوف' : ''}`;
            const empRecs = state.empFinancials.filter(f => f.employee_id === selectedEmployeeHistoryId);

            if (empRecs.length === 0) {
                document.getElementById('empFinancialsTableBody').innerHTML = `<tr><td colspan="6" class="p-5 text-center text-slate-400">لا توجد سلف أو مكافآت مسجلة</td></tr>`;
            } else {
                document.getElementById('empFinancialsTableBody').innerHTML = empRecs.map(f => {
                    const fDate = new Date(f.transaction_date || f.created_at);
                    const isCurrentCycle = fDate >= cycleStart;
                    return `
                        <tr class="${isCurrentCycle ? '' : 'bg-slate-50 text-slate-400'}">
                            <td class="p-3">${f.transaction_type === 'loan' ? '<span class="text-rose-600 font-bold">🔻 سلفة مخصومة</span>' : '<span class="text-emerald-600 font-bold">🎁 بونص</span>'}</td>
                            <td class="p-3 font-bold">${Number(f.amount).toLocaleString()} ج.م</td>
                            <td class="p-3">${esc(f.notes) || '-'}</td>
                            <td class="p-3 text-xs">${fDate.toLocaleString('ar-EG')}</td>
                            <td class="p-3">
                                ${isCurrentCycle
                                    ? '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-bold">🟢 في دورة الشهر الحالي</span>'
                                    : '<span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">📦 دورة شهر سابق</span>'}
                            </td>
                            <td class="p-3 ${currentUser.role === 'owner' ? '' : 'hidden'}">
                                <button onclick="deleteRow('employee_financials', '${f.id}')" class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-bold">حذف</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } else {
        historyBox.classList.add('hidden');
    }
}
function renderArchivedEmployees(archivedEmployees) {
    const box = document.getElementById('archivedEmployeesBox');
    if (!box) return;
    if (currentUser.role !== 'owner' || archivedEmployees.length === 0) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `
        <details class="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <summary class="cursor-pointer font-extrabold text-slate-700">🗂️ الموظفين المحذوفين (${archivedEmployees.length}) — معاملاتهم محفوظة</summary>
            <div class="mt-3 space-y-2">
                ${archivedEmployees.map(emp => {
                    const recsCount = state.empFinancials.filter(f => f.employee_id === emp.id).length;
                    const dealsCount = state.deals.filter(d => d.employee_id === emp.id).length;
                    return `
                    <div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3">
                        <div>
                            <div class="font-bold text-slate-800">${esc(emp.full_name)}</div>
                            <div class="text-[11px] text-slate-500">📱 ${esc(emp.phone_whatsapp) || 'غير مسجل'} · ${recsCount} سلفة/بونص · ${dealsCount} ديل · اتحذف ${new Date(emp.archived_at).toLocaleDateString('ar-EG')}</div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="toggleEmployeeCardHistory('${emp.id}', event)" class="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-bold">📅 السجل</button>
                            <button onclick="restoreEmployee('${emp.id}')" class="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg font-bold">♻️ استرجاع</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </details>`;
}
