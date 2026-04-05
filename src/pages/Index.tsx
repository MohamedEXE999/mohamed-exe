import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Send, ArrowRight, ArrowLeft, Brain, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

async function streamChat({
  messages,
  context,
  onDelta,
  onDone,
}: {
  messages: Message[];
  context: string;
  onDelta: (text: string) => void;
  onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, context }),
  });

  if (resp.status === 429) { toast.error("تم تجاوز حد الطلبات، حاول لاحقاً"); onDone(); return; }
  if (resp.status === 402) { toast.error("يرجى إضافة رصيد لحساب Lovable AI"); onDone(); return; }
  if (!resp.ok || !resp.body) throw new Error("فشل الاتصال");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { onDone(); return; }
      try {
        const c = JSON.parse(json).choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  onDone();
}

const Index = () => {
  const [step, setStep] = useState<"input" | "chat">("input");
  const [context, setContext] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmitContext = () => {
    if (!context.trim()) { toast.error("الرجاء إدخال المعلومات أولاً"); return; }
    setStep("chat");
    toast.success("تم تحليل المعلومات بنجاح!");
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant")
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        context,
        onDelta: upsert,
        onDone: () => setIsLoading(false),
      });
    } catch {
      toast.error("حدث خطأ أثناء الاتصال بالذكاء الاصطناعي");
      setIsLoading(false);
    }
  };

  if (step === "input") {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted">
        <div className="w-full max-w-2xl space-y-8 animate-fade-in">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">المساعد الذكي</h1>
            <p className="text-muted-foreground text-lg">أدخل المعلومات التي تريد تحليلها، ثم اسأل أي سؤال عنها</p>
          </div>

          {/* Input Card */}
          <Card className="border-2 border-border/50 shadow-xl backdrop-blur-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>الخطوة ١: أدخل المعلومات</span>
              </div>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="اكتب أو الصق المعلومات هنا... مثلاً: نص مقال، بيانات، ملاحظات، أو أي محتوى تريد تحليله"
                className="min-h-[200px] text-base leading-relaxed resize-none"
                dir="rtl"
              />
              <Button onClick={handleSubmitContext} className="w-full gap-2 h-12 text-base font-semibold">
                <span>تحليل المعلومات والمتابعة</span>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </CardContent>
          </Card>

          {/* Steps indicator */}
          <div className="flex justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">١</div>
              <span>إدخال المعلومات</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold">٢</div>
              <span>طرح الأسئلة</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">المساعد الذكي</h1>
              <p className="text-xs text-muted-foreground">يجيب بناءً على المعلومات المُدخلة</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setStep("input"); setMessages([]); }}
            className="gap-1"
          >
            <ArrowRight className="w-4 h-4" />
            <span>تعديل المعلومات</span>
          </Button>
        </div>
      </header>

      {/* Context preview */}
      <div className="max-w-3xl mx-auto w-full px-4 py-2">
        <details className="bg-muted/50 rounded-lg">
          <summary className="px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            المعلومات المُدخلة ({context.length} حرف)
          </summary>
          <div className="px-4 pb-3 text-sm text-foreground/80 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {context}
          </div>
        </details>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-accent" />
              </div>
              <p className="text-muted-foreground text-lg">اسأل أي سؤال عن المعلومات المُدخلة</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["لخص المعلومات", "ما هي النقاط الرئيسية؟", "اشرح بالتفصيل"].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="px-4 py-2 rounded-full bg-muted hover:bg-muted/80 text-sm text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border shadow-sm rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-end">
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border/50 bg-card/80 backdrop-blur-md sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2 items-end"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="اكتب سؤالك هنا..."
              className="min-h-[44px] max-h-32 resize-none text-base"
              dir="rtl"
              rows={1}
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={isLoading || !input.trim()}>
              <Send className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Index;
