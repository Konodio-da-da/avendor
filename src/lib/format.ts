export const formatNgn = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(iso))
