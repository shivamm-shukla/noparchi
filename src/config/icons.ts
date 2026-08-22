/**
 * Maps the icon names stored on a ticket type to actual lucide components.
 *
 * Ticket types live in the database, so they can only store an icon *name*.
 * This is the single place that turns that string into a renderable component -
 * add a case here when you add a new icon option to TicketTypeIcon.
 */
import { Bike, Car, Truck, Ticket, Bus, User, type LucideIcon } from 'lucide-react-native';
import type { TicketTypeIcon } from './pricing';

export const TICKET_TYPE_ICONS: Record<TicketTypeIcon, LucideIcon> = {
  bike: Bike,
  car: Car,
  truck: Truck,
  ticket: Ticket,
  bus: Bus,
  person: User,
};

/** Never throws on unknown/legacy icon names - falls back to a generic ticket. */
export function ticketTypeIcon(name: string | null | undefined): LucideIcon {
  return TICKET_TYPE_ICONS[name as TicketTypeIcon] ?? Ticket;
}
