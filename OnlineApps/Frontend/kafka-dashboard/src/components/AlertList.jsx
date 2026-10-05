import AlertCard from './AlertCard';

export default function AlertList({ alerts }) {
  if (alerts.length === 0) {
    return <div className="no-alerts">No alerts yet. Waiting for data...</div>;
  }

  return (
    <section className="alert-list" aria-label="Deviation alerts">
      {alerts.map((alert) => (
        <AlertCard key={alert.alert_id} alert={alert} />
      ))}
    </section>
  );
}
