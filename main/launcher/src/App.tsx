import { Header } from "./components/Header";
import { ActionMatrix } from "./components/ActionMatrix";
import { EventStream } from "./components/EventStream";
import { useProcessStatus } from "./hooks/useProcessStatus";
import { useLogStream } from "./hooks/useLogStream";
import "./App.css";

export default function App() {
  const { status, error, refresh } = useProcessStatus(2000);
  const { logs } = useLogStream();

  return (
    <div className="app">
      <Header status={status} error={error} />
      <ActionMatrix status={status} onActionComplete={refresh} />
      <EventStream logs={logs} />
    </div>
  );
}
