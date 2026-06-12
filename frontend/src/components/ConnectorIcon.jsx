import { Server, Box, Activity, HardDrive, Network, Cloud, Settings } from "lucide-react";

const icons = {
  server: Server,
  box: Box,
  activity: Activity,
  "hard-drive": HardDrive,
  network: Network,
  cloud: Cloud,
};

export default function ConnectorIcon({ icon, size = 18, className = "" }) {
  const Icon = icons[icon] ?? Settings;
  return <Icon size={size} className={className} />;
}
