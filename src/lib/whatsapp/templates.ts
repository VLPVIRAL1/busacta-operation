// WhatsApp message templates — pure functions, no side effects.

export function loginOtpMessage(code: string): string {
  return `Your BusAcTa Operations sign-in code is *${code}*. Expires in 5 minutes. Do not share this code.`;
}

export function taskAssignedMessage(taskTitle: string, assignerName: string): string {
  return `📋 *Task assigned to you*\n\n*${taskTitle}*\nAssigned by ${assignerName}\n\nOpen BusAcTa Operations to view details.`;
}

export function taskStatusChangedMessage(
  taskTitle: string,
  oldStatus: string,
  newStatus: string,
  changerName: string,
): string {
  return `🔄 *Task status updated*\n\n*${taskTitle}*\n${formatStatus(oldStatus)} → ${formatStatus(newStatus)}\nUpdated by ${changerName}\n\nOpen BusAcTa Operations to view details.`;
}

export function taskCommentedMessage(taskTitle: string, commenterName: string): string {
  return `💬 *New comment on task*\n\n*${taskTitle}*\n${commenterName} left a comment\n\nOpen BusAcTa Operations to reply.`;
}

export function taskDueSoonMessage(taskTitle: string, dueDate: string): string {
  return `⏰ *Task due soon*\n\n*${taskTitle}*\nDue: ${dueDate}\n\nOpen BusAcTa Operations to update progress.`;
}

export function taskOverdueMessage(taskTitle: string, dueDate: string): string {
  return `🚨 *Task overdue*\n\n*${taskTitle}*\nWas due: ${dueDate}\n\nOpen BusAcTa Operations to take action.`;
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
