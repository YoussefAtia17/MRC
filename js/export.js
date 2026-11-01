// =========================================================================
// تصدير البيانات لملف Excel (الديلز المعروضة حالياً + بيانات الأونر)
// =========================================================================

const DEAL_STATUS_LABELS = { completed: 'تم الشراء (Done)', in_progress: 'قيد التواصل', cancelled: 'لم يتم الاتفاق' };

function sheetFromRows(rows) {
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    const headers = Object.keys(rows[0] || {});
    // عرض كل عمود على قد أطول قيمة فيه (بحد أقصى عشان الخانات الطويلة)
    ws['!cols'] = headers.map(h => ({
        wch: Math.min(50, Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)) + 2)
    }));
    return ws;
}

function toDate(value) {
    return value ? new Date(value) : '';
}

function buildDealRows(deals) {
    return deals.map(d => {
        const waInst = state.waInstances.find(w => Number(w.id) === Number(d.whatsapp_instance_id));
        return {
            'العميل': d.client_name || '',
            'التليفون': d.client_phone || '',
            'المكان': d.client_location || '',
            'نوع الساعة': d.watch_brand || '',
            'تفاصيل الديل': d.deal_details || '',
            'العميل طالب (ج.م)': Number(d.amount_requested || 0),
            'رينج البيع': d.selling_price_range || '',
            'المدفوع (ج.م)': Number(d.amount_paid || 0),
            'الحالة': DEAL_STATUS_LABELS[d.status] || d.status || '',
            'الموظف المسؤول': getDealEmployeeName(d) || 'بدون موظف',
            'سجّله': d.assigned_by_name || '',
            'المعاد': toDate(d.meeting_time),
            'خط الواتساب': waInst ? `${waInst.instance_name} (${waInst.phone_number})` : '',
            'رسالة التذكير': d.reminder_message || '',
            'تاريخ التسجيل': toDate(d.created_at)
        };
    });
}

function buildEmployeeRows() {
    return state.employees.map(emp => {
        const recs = state.empFinancials.filter(f => f.employee_id === emp.id);
        const sum = type => recs.filter(f => f.transaction_type === type).reduce((s, f) => s + Number(f.amount), 0);
        return {
            'الاسم': emp.full_name,
            'واتساب': emp.phone_whatsapp || '',
            'المرتب الأساسي (ج.م)': Number(emp.base_salary || 0),
            'عدد الديلز': state.deals.filter(d => d.employee_id === emp.id).length,
            'إجمالي السلف (ج.م)': sum('loan'),
            'إجمالي البونص (ج.م)': sum('bonus'),
            'الحالة': emp.archived_at ? 'محذوف (مؤرشف)' : 'شغال',
            'تاريخ الإضافة': toDate(emp.created_at)
        };
    });
}

function buildFinancialRows() {
    return state.empFinancials.map(f => {
        const emp = state.employees.find(e => e.id === f.employee_id);
        return {
            'الموظف': emp ? emp.full_name : '',
            'النوع': f.transaction_type === 'loan' ? 'سلفة' : 'بونص',
            'المبلغ (ج.م)': Number(f.amount),
            'البيان': f.notes || '',
            'التاريخ': toDate(f.transaction_date || f.created_at)
        };
    });
}

function buildTreasuryRows() {
    let running = 0;
    return [...state.treasury]
        .sort((a, b) => new Date(a.transaction_date || a.created_at) - new Date(b.transaction_date || b.created_at))
        .map(t => {
            const amount = Number(t.amount);
            running += t.transaction_type === 'in' ? amount : -amount;
            return {
                'النوع': t.transaction_type === 'in' ? 'إيداع (وارد)' : 'صرف (منصرف)',
                'المبلغ (ج.م)': amount,
                'البيان': t.description || '',
                'الرصيد بعد الحركة (ج.م)': running,
                'التاريخ': toDate(t.transaction_date || t.created_at)
            };
        });
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        return alert("⚠️ مكتبة الـ Excel لسه بتحمّل، جرب تاني كمان ثانية.");
    }
    if (lastRenderedDeals.length === 0 && currentUser.role !== 'owner') {
        return alert("⚠️ مفيش ديلز في النتيجة الحالية عشان تتصدّر.");
    }

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    const appendSheet = (rows, name) => { if (rows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), name); };

    appendSheet(buildDealRows(lastRenderedDeals), 'الديلز');
    let treasuryNote = '';
    if (currentUser.role === 'owner') {
        appendSheet(buildEmployeeRows(), 'الموظفين');
        appendSheet(buildFinancialRows(), 'السلف والبونص');
        if (isTreasuryUnlocked) appendSheet(buildTreasuryRows(), 'الخزنة');
        else treasuryNote = ' (الخزنة مش متضمنة لأنها مقفولة — افتحها الأول لو عايزها في الملف)';
    }
    if (wb.SheetNames.length === 0) return alert("⚠️ مفيش بيانات تتصدّر.");

    const empFilter = document.getElementById('dealEmployeeFilter');
    const empName = empFilter && empFilter.value && empFilter.value !== 'none'
        ? '-' + (state.employees.find(e => e.id === empFilter.value)?.full_name || '').replace(/[\\/:*?"<>|]/g, '')
        : '';
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `MRC${empName}-${today}.xlsx`, { compression: true });
    showToast(`📥 تم تصدير ملف Excel فيه (${wb.SheetNames.join('، ')})${esc(treasuryNote)}`, 'success');
}
