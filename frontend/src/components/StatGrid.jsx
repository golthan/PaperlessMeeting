import { Activity, CalendarDays, CheckSquare, DoorOpen, Users, Vote } from "lucide-react";

const icons = {
  totalUsers: Users,
  totalMeetings: CalendarDays,
  ongoingMeetings: Activity,
  upcomingMeetings: CalendarDays,
  totalRooms: DoorOpen,
  totalVotes: Vote,
  invitedMeetings: CalendarDays,
  pendingInvites: Activity,
  openVotes: Vote,
  tasks: CheckSquare
};

export function StatGrid({ stats }) {
  return (
    <section className="stat-grid">
      {stats.map((item) => {
        const Icon = icons[item.key] || Activity;
        return (
          <article className="stat-card" key={item.label}>
            <div className="icon-tile">
              <Icon size={20} />
            </div>
            <div>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </div>
          </article>
        );
      })}
    </section>
  );
}

