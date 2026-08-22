export function formatCurrency(amount: number, currency = 'INR'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString).getTime();
    const now = Date.now();
    const diffSecs = Math.floor((now - date) / 1000);

    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

export function getVehicleLabel(type: string): { label: string; icon: string } {
  switch (type) {
    case 'TWO_WHEELER':
      return { label: '2 Wheeler', icon: 'Bike' };
    case 'FOUR_WHEELER':
      return { label: '4 Wheeler (Car)', icon: 'Car' };
    case 'HEAVY_VEHICLE':
      return { label: 'Heavy Vehicle / Bus', icon: 'Truck' };
    default:
      return { label: 'General Pass', icon: 'Ticket' };
  }
}
