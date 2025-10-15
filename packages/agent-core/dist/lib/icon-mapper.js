"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIconComponent = getIconComponent;
const lucide_react_1 = require("lucide-react");
const iconMap = {
    Package: lucide_react_1.Package, Rocket: lucide_react_1.Rocket, Code: lucide_react_1.Code, Zap: lucide_react_1.Zap, Database: lucide_react_1.Database, Globe: lucide_react_1.Globe, ShoppingCart: lucide_react_1.ShoppingCart, Calendar: lucide_react_1.Calendar,
    MessageSquare: lucide_react_1.MessageSquare, Mail: lucide_react_1.Mail, FileText: lucide_react_1.FileText, Image: lucide_react_1.Image, Music: lucide_react_1.Music, Video: lucide_react_1.Video, Book: lucide_react_1.Book, Heart: lucide_react_1.Heart, Star: lucide_react_1.Star,
    Users: lucide_react_1.Users, Settings: lucide_react_1.Settings, Layout: lucide_react_1.Layout, Grid: lucide_react_1.Grid, List: lucide_react_1.List, Edit: lucide_react_1.Edit, Search: lucide_react_1.Search, Filter: lucide_react_1.Filter, Download: lucide_react_1.Download,
    Upload: lucide_react_1.Upload, Share: lucide_react_1.Share, Lock: lucide_react_1.Lock, Key: lucide_react_1.Key, Bell: lucide_react_1.Bell, Clock: lucide_react_1.Clock, CheckCircle: lucide_react_1.CheckCircle, XCircle: lucide_react_1.XCircle, AlertCircle: lucide_react_1.AlertCircle,
    Info: lucide_react_1.Info, HelpCircle: lucide_react_1.HelpCircle, Lightbulb: lucide_react_1.Lightbulb, Target: lucide_react_1.Target, Award: lucide_react_1.Award, Briefcase: lucide_react_1.Briefcase, Coffee: lucide_react_1.Coffee, Home: lucide_react_1.Home,
    Puzzle: lucide_react_1.Puzzle, Box: lucide_react_1.Box, Layers: lucide_react_1.Layers, Activity: lucide_react_1.Activity, TrendingUp: lucide_react_1.TrendingUp, BarChart: lucide_react_1.BarChart, PieChart: lucide_react_1.PieChart, DollarSign: lucide_react_1.DollarSign,
    CreditCard: lucide_react_1.CreditCard, Smartphone: lucide_react_1.Smartphone, Monitor: lucide_react_1.Monitor, Tablet: lucide_react_1.Tablet, Cpu: lucide_react_1.Cpu, Terminal: lucide_react_1.Terminal, Cloud: lucide_react_1.Cloud, Server: lucide_react_1.Server,
    Wifi: lucide_react_1.Wifi, Bluetooth: lucide_react_1.Bluetooth, Camera: lucide_react_1.Camera, Mic: lucide_react_1.Mic, Folder: lucide_react_1.Folder,
};
function getIconComponent(iconName) {
    if (!iconName || !iconMap[iconName]) {
        return lucide_react_1.Folder; // Default fallback
    }
    return iconMap[iconName];
}
