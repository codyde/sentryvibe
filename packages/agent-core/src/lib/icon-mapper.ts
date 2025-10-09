import {
  Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar,
  MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star,
  Users, Settings, Layout, Grid, List, Edit, Search, Filter, Download,
  Upload, Share, Lock, Key, Bell, Clock, CheckCircle, XCircle, AlertCircle,
  Info, HelpCircle, Lightbulb, Target, Award, Briefcase, Coffee, Home,
  Puzzle, Box, Layers, Activity, TrendingUp, BarChart, PieChart, DollarSign,
  CreditCard, Smartphone, Monitor, Tablet, Cpu, Terminal, Cloud, Server,
  Wifi, Bluetooth, Camera, Mic, Folder,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar,
  MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star,
  Users, Settings, Layout, Grid, List, Edit, Search, Filter, Download,
  Upload, Share, Lock, Key, Bell, Clock, CheckCircle, XCircle, AlertCircle,
  Info, HelpCircle, Lightbulb, Target, Award, Briefcase, Coffee, Home,
  Puzzle, Box, Layers, Activity, TrendingUp, BarChart, PieChart, DollarSign,
  CreditCard, Smartphone, Monitor, Tablet, Cpu, Terminal, Cloud, Server,
  Wifi, Bluetooth, Camera, Mic, Folder,
};

export function getIconComponent(iconName: string | null | undefined): LucideIcon {
  if (!iconName || !iconMap[iconName]) {
    return Folder; // Default fallback
  }
  return iconMap[iconName];
}
