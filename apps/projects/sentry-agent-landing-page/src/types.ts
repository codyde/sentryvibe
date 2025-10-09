export interface ChatMessage {
  id: number;
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp: number;
  status?: 'typing' | 'sent' | 'error';
}

export interface AgentMetric {
  label: string;
  value: string;
  trend?: 'up' | 'down';
  color: string;
}
