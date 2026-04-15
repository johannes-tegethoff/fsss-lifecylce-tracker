export function formatDateShort(dateStr) {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
