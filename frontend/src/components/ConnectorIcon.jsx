import {
  Server, Box, Activity, HardDrive, Network, Cloud, Settings,
  Terminal, Shield, Archive, BarChart2, Zap, Lock, Wifi,
  Cpu, Thermometer, Gauge, Globe, Layers, Bookmark, Brain,
  Radio, Monitor, Database,
} from "lucide-react";

const icons = {
  server:        Server,
  box:           Box,
  activity:      Activity,
  "hard-drive":  HardDrive,
  network:       Network,
  cloud:         Cloud,
  terminal:      Terminal,
  shield:        Shield,
  archive:       Archive,
  "bar-chart-2": BarChart2,
  zap:           Zap,
  lock:          Lock,
  wifi:          Wifi,
  cpu:           Cpu,
  thermometer:   Thermometer,
  gauge:         Gauge,
  globe:         Globe,
  layers:        Layers,
  bookmark:      Bookmark,
  brain:         Brain,
  radio:         Radio,
  monitor:       Monitor,
  database:      Database,
};

export default function ConnectorIcon({ icon, size = 18, className = "" }) {
  const Icon = icons[icon] ?? Settings;
  return <Icon size={size} className={className} />;
}
