import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, TrendingUp, AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import type { ChatMessage } from '../types';

const mockMessages: Omit<ChatMessage, 'id' | 'timestamp'>[] = [
  {
    role: 'system',
    content: '🚀 Agent monitoring initialized',
    status: 'sent'
  },
  {
    role: 'user',
    content: 'Hey, did that deployment just tank our error rate?',
    status: 'sent'
  },
  {
    role: 'agent',
    content: 'Analyzing production metrics... Found 247 new errors in the last 3 minutes. Main culprit: `getUserProfile()` throwing 500s. Want me to roll back?',
    status: 'sent'
  },
  {
    role: 'user',
    content: 'Yep, roll it back!',
    status: 'sent'
  },
  {
    role: 'agent',
    content: 'Done! Triggered rollback to v2.4.1. Error rate dropping. Your users won\'t even know you pushed on a Friday. 😎',
    status: 'sent'
  },
  {
    role: 'system',
    content: '✅ Crisis averted. Error rate: 0.02%',
    status: 'sent'
  }
];

export default function AgentChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    if (currentMessageIndex < mockMessages.length) {
      const timer = setTimeout(() => {
        const newMessage: ChatMessage = {
          ...mockMessages[currentMessageIndex],
          id: currentMessageIndex,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, newMessage]);
        setCurrentMessageIndex(prev => prev + 1);
      }, currentMessageIndex === 0 ? 500 : 2000);

      return () => clearTimeout(timer);
    } else {
      // Reset animation after completion
      const resetTimer = setTimeout(() => {
        setMessages([]);
        setCurrentMessageIndex(0);
      }, 5000);

      return () => clearTimeout(resetTimer);
    }
  }, [currentMessageIndex]);

  return (
    <div className="relative w-full h-full">
      {/* Chatbot Window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-[#1A0F2E] border-2 border-[#7553FF]/30 rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#7553FF] to-[#A737B4] p-4 flex items-center gap-3">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
            >
              <Bot className="w-6 h-6 text-white" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-[#7553FF]"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">Sentry Agent</h3>
            <p className="text-white/80 text-xs">Monitoring your production</p>
          </div>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-white/30" />
            <div className="w-3 h-3 rounded-full bg-white/30" />
            <div className="w-3 h-3 rounded-full bg-white/30" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[400px] md:max-h-[500px]">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
              >
                {message.role === 'system' ? (
                  <div className="flex justify-center">
                    <div className="bg-[#7553FF]/20 border border-[#7553FF]/30 rounded-lg px-4 py-2 text-xs text-[#9E86FF] flex items-center gap-2">
                      {message.content.includes('Crisis') ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Zap className="w-4 h-4 text-yellow-400" />
                      )}
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user'
                        ? 'bg-[#4E2A9A]'
                        : 'bg-gradient-to-br from-[#7553FF] to-[#A737B4]'
                    }`}>
                      {message.role === 'user' ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-[#4E2A9A] text-white rounded-tr-sm'
                          : 'bg-[#2D1B4E] text-[#E0D7FF] rounded-tl-sm border border-[#7553FF]/20'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Metrics Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="border-t border-[#7553FF]/20 p-3 bg-[#0F0820]/50"
        >
          <div className="flex justify-around text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-400" />
              <span className="text-[#9E86FF]">99.9% uptime</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-yellow-400" />
              <span className="text-[#9E86FF]">0 alerts</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#7553FF]" />
              <span className="text-[#9E86FF]">Fast</span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating particles */}
      <motion.div
        animate={{
          y: [0, -20, 0],
          x: [0, 10, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute -top-4 -right-4 w-20 h-20 bg-[#7553FF]/20 rounded-full blur-xl"
      />
      <motion.div
        animate={{
          y: [0, 20, 0],
          x: [0, -10, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
        className="absolute -bottom-4 -left-4 w-24 h-24 bg-[#A737B4]/20 rounded-full blur-xl"
      />
    </div>
  );
}
