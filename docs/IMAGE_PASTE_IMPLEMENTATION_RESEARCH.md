# Image Paste Implementation Research

**Date:** 2025-11-10
**Use Case:** Enable users to paste images into prompt input and have Claude analyze them
**Example:** "I want to build a page with a layout like this image"

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Claude API Image Support](#claude-api-image-support)
3. [Vercel AI SDK Integration](#vercel-ai-sdk-integration)
4. [Implementation Plan](#implementation-plan)
5. [Technical Details](#technical-details)
6. [UI/UX Requirements](#uiux-requirements)

---

## Current Architecture

### Prompt Input System

**Location:** `/home/user/sentryvibe/apps/sentryvibe/src/app/page.tsx`

```typescript
// Input state (line 86)
const [input, setInput] = useState("")

// Textarea component (lines 3155-3183)
<textarea
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder="Continue the conversation..."
  className="..."
/>

// Submit handler (lines 1935-2068)
const handleSubmit = async () => {
  // For NEW projects: creates via POST /api/projects then calls startGenerationStream()
  // For EXISTING projects: calls startGeneration() → saves to DB → initiates stream
}
```

### Current Message Structure

**Type Definition:** `apps/sentryvibe/src/app/page.tsx:63-81`

```typescript
interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
}

interface Message {
  id: string;
  projectId?: string;
  type?: 'user' | 'assistant' | 'system' | 'tool-call' | 'tool-result';
  role?: 'user' | 'assistant';
  content?: string;          // Currently just a string!
  parts?: MessagePart[];
  timestamp?: number;
}
```

**Current Limitations:**
- ❌ No image/binary data support
- ❌ No paste event handlers
- ❌ No base64 encoding logic
- ❌ Message API only accepts `{ role, content: string }`

### Message Storage API

**Location:** `apps/sentryvibe/src/app/api/projects/[id]/messages/route.ts:239-275`

```typescript
// POST /api/projects/:id/messages
export async function POST(req: Request, { params }) {
  const { role, content } = await req.json();

  // Validates role is 'user' or 'assistant'
  // Serializes content with serializeContent()
  // Stores in database

  return NextResponse.json({ message: formatted });
}
```

**File Size Limit:** 500KB per file (based on file content API)

### Claude Integration

**Location:** `apps/sentryvibe/src/app/api/chat/route.ts`

- Uses **Vercel AI SDK v5.0.79** (`streamText` function)
- Converts messages via `convertToModelMessages(messages)` (line 124)
- Supports `claude-haiku-4-5` and `claude-sonnet-4-5` models
- Returns `result.toUIMessageStreamResponse()`

### Message Display

**Component:** `apps/sentryvibe/src/components/ChatUpdate.tsx`

- Renders markdown content using `ReactMarkdown`
- Syntax highlighting with `rehype-highlight`
- No image preview capability currently

---

## Claude API Image Support

### Image Format Requirements

Claude API (as of January 2025) supports images through **base64 encoding**.

**Supported Formats:**
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`

**Size Limits:**
- Maximum: **5MB per image** for API requests
- Maximum: **20 images per turn**

### Claude Message Format with Images

```json
{
  "role": "user",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "iVBORw0KGgoAAAANSUhEUgAA..."
      }
    },
    {
      "type": "text",
      "text": "I want to build a page with a layout like this image"
    }
  ]
}
```

**Important Notes:**
- Place images **before text** for optimal performance
- The `data` field contains the raw base64 string (no `data:` URI prefix)
- Multiple images can be included in a single message

**Documentation:** https://docs.claude.com/en/docs/build-with-claude/vision

---

## Vercel AI SDK Integration

### UIMessage Structure

The Vercel AI SDK v5 uses `UIMessage` for application state and `convertToModelMessages()` to transform it into provider-specific formats.

**Key Features:**
- Multi-part message content (text, images, tool calls, etc.)
- Automatic conversion to Claude's format via `convertToModelMessages()`
- Support for various media types

**MessagePart Types (from documentation):**
- `text` - Text content
- `image` - Image data (base64 or URL)
- `tool-call` - Tool invocations
- `tool-result` - Tool execution results
- `file` - Generated files

### Image Part Structure

Based on Vercel AI SDK patterns and Claude requirements, the image part should be:

```typescript
{
  type: 'image',
  image: string,           // base64 data URL: "data:image/png;base64,..."
  mimeType?: string,       // e.g., "image/png"
  experimental_providerMetadata?: {
    anthropic?: {
      source?: {
        type: 'base64',
        media_type: string,
        data: string
      }
    }
  }
}
```

The `convertToModelMessages()` function will handle transforming this into Claude's expected format.

---

## Implementation Plan

### Phase 1: Extend Message Types

**Files to Modify:**
1. `apps/sentryvibe/src/app/page.tsx:63-81` - Update `MessagePart` type
2. `packages/agent-core/src/lib/runner/persistent-event-processor.ts:37-40` - Update matching type

**New MessagePart Type:**

```typescript
interface MessagePart {
  type: 'text' | 'image' | 'tool-call' | 'tool-result';

  // Text content
  text?: string;

  // Image content
  image?: string;              // base64 data URL
  mimeType?: string;           // e.g., "image/png"
  fileName?: string;           // e.g., "screenshot.png"

  // Tool content
  toolCallId?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
}
```

### Phase 2: Add Paste Handler

**File:** `apps/sentryvibe/src/app/page.tsx` (near line 3155)

**Implementation:**

```typescript
// Add state for image attachments
const [imageAttachments, setImageAttachments] = useState<MessagePart[]>([]);

// Paste handler
const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
  const items = e.clipboardData.items;

  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      e.preventDefault(); // Prevent default paste behavior

      const file = item.getAsFile();
      if (!file) continue;

      // Check size limit (5MB)
      if (file.size > 5 * 1024 * 1024) {
        // Show error toast: "Image too large. Maximum size is 5MB."
        continue;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;

        setImageAttachments(prev => [...prev, {
          type: 'image',
          image: base64Data,
          mimeType: file.type,
          fileName: file.name || `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
        }]);
      };
      reader.readAsDataURL(file);
    }
  }
};

// Add to textarea
<textarea
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={handleKeyDown}
  onPaste={handlePaste}  // Add this
  placeholder="Continue the conversation..."
/>
```

### Phase 3: Update Message Submission

**File:** `apps/sentryvibe/src/app/page.tsx` (handleSubmit function around line 1935)

**Modify submission to include image parts:**

```typescript
const handleSubmit = async () => {
  if (!input.trim() && imageAttachments.length === 0) return;

  // Build message parts array
  const messageParts: MessagePart[] = [];

  // Add images first (Claude best practice)
  if (imageAttachments.length > 0) {
    messageParts.push(...imageAttachments);
  }

  // Add text content
  if (input.trim()) {
    messageParts.push({
      type: 'text',
      text: input.trim(),
    });
  }

  // Create optimistic message
  const newMessage: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: input.trim(),
    parts: messageParts,
    timestamp: Date.now(),
  };

  // Add to messages state
  setMessages(prev => [...prev, newMessage]);

  // Clear input and attachments
  setInput('');
  setImageAttachments([]);

  // Save to database...
  // Continue with existing logic...
};
```

### Phase 4: Update Message API

**File:** `apps/sentryvibe/src/app/api/projects/[id]/messages/route.ts:239-275`

**Modify to accept multi-part content:**

```typescript
export async function POST(req: Request, { params }) {
  const { id } = await params;
  const { role, content, parts } = await req.json();

  if (!role) {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 });
  }

  if (!content && (!parts || parts.length === 0)) {
    return NextResponse.json(
      { error: 'Content or parts are required' },
      { status: 400 }
    );
  }

  // Serialize content (may be string or parts array)
  let serializedContent: string;
  if (parts && parts.length > 0) {
    serializedContent = JSON.stringify(parts);
  } else {
    serializedContent = serializeContent(content);
  }

  const [newMessage] = await db
    .insert(messages)
    .values({
      projectId: id,
      role: role,
      content: serializedContent,
    })
    .returning();

  return NextResponse.json({
    message: {
      ...newMessage,
      content: parseMessageContent(newMessage.content),
    }
  });
}
```

### Phase 5: Update Claude API Integration

**File:** `apps/sentryvibe/src/app/api/chat/route.ts` (around line 124)

The Vercel AI SDK's `convertToModelMessages()` should automatically handle the conversion, but verify the format:

```typescript
// Current code:
const result = streamText({
  model: claudeCode(resolveClaudeModelForProvider(selectedClaudeModel)),
  system: systemPrompt,
  messages: convertToModelMessages(messages), // This should handle image parts
  // ...
});
```

**Verification needed:** Test that UIMessage with image parts converts correctly to Claude's format.

If manual conversion is needed, add a helper:

```typescript
function prepareMessagesForClaude(messages: UIMessage[]) {
  return messages.map(msg => {
    if (!msg.parts || msg.parts.length === 0) {
      return msg;
    }

    // Transform image parts to Claude format
    const content = msg.parts.map(part => {
      if (part.type === 'image' && part.image) {
        // Extract base64 data from data URL
        const match = part.image.match(/^data:(.+);base64,(.+)$/);
        if (match) {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            }
          };
        }
      }

      if (part.type === 'text') {
        return {
          type: 'text',
          text: part.text,
        };
      }

      return part;
    });

    return {
      ...msg,
      content,
    };
  });
}
```

### Phase 6: UI - Image Preview Display

**File:** Create new component `apps/sentryvibe/src/components/ImageAttachment.tsx`

```typescript
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface ImageAttachmentProps {
  fileName: string;
  imageSrc: string;
  onRemove?: () => void;
  showRemove?: boolean;
}

export default function ImageAttachment({
  fileName,
  imageSrc,
  onRemove,
  showRemove = false,
}: ImageAttachmentProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        className="px-3 py-2 bg-purple-600/20 border border-purple-400/40 rounded-lg text-sm text-purple-200 cursor-pointer hover:bg-purple-600/30 transition-colors flex items-center gap-2"
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
      >
        <span className="font-mono">{fileName}</span>
        {showRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Hover preview */}
      {showPreview && (
        <div className="absolute bottom-full left-0 mb-2 z-50 p-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
          <img
            src={imageSrc}
            alt={fileName}
            className="max-w-sm max-h-64 object-contain"
          />
        </div>
      )}
    </div>
  );
}
```

**Usage in page.tsx:**

```typescript
{/* Image attachments preview - add above textarea */}
{imageAttachments.length > 0 && (
  <div className="flex flex-wrap gap-2 mb-2">
    {imageAttachments.map((attachment, idx) => (
      <ImageAttachment
        key={idx}
        fileName={attachment.fileName || 'image.png'}
        imageSrc={attachment.image || ''}
        showRemove
        onRemove={() => {
          setImageAttachments(prev => prev.filter((_, i) => i !== idx));
        }}
      />
    ))}
  </div>
)}
```

### Phase 7: Update ChatUpdate Component

**File:** `apps/sentryvibe/src/components/ChatUpdate.tsx`

**Modify to accept and display message parts:**

```typescript
interface ChatUpdateProps {
  content?: string;
  parts?: MessagePart[];  // Add this
  align?: 'left' | 'right';
  tone?: 'user' | 'agent';
  variant?: 'live' | 'history';
  timestamp?: string | null;
  className?: string;
}

export default function ChatUpdate({
  content,
  parts,  // Add this
  align = 'left',
  tone = 'user',
  // ...
}: ChatUpdateProps) {
  return (
    <div className={containerClasses}>
      {/* Display image parts */}
      {parts && parts.filter(p => p.type === 'image').map((part, idx) => (
        <ImageAttachment
          key={idx}
          fileName={part.fileName || 'image.png'}
          imageSrc={part.image || ''}
          showRemove={false}
        />
      ))}

      {/* Display text content */}
      <div className={cn('prose prose-sm prose-invert max-w-none')}>
        <ReactMarkdown>
          {content || parts?.find(p => p.type === 'text')?.text || ''}
        </ReactMarkdown>
      </div>

      {/* Timestamp */}
      {timestamp && <div className="..."><span>{timestamp}</span></div>}
    </div>
  );
}
```

---

## Technical Details

### Base64 Encoding Best Practices

1. **Use FileReader API:**
   ```typescript
   const reader = new FileReader();
   reader.readAsDataURL(file); // Returns "data:image/png;base64,..."
   ```

2. **Extract base64 data for Claude:**
   ```typescript
   const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
   const mimeType = match[1];  // "image/png"
   const base64Data = match[2]; // Raw base64 string
   ```

3. **Size considerations:**
   - Base64 encoding increases size by ~33%
   - A 5MB image becomes ~6.65MB as base64
   - Set UI limit to 4MB to stay under Claude's 5MB limit

### Database Storage

The current `messages` table stores content as TEXT:

```sql
content TEXT
```

**Options:**
1. **Store as JSON string** (current approach with `serializeContent()`)
   - Pros: No schema changes needed
   - Cons: Large base64 strings in database

2. **Store images separately** (recommended for production)
   - Add `message_attachments` table
   - Store images in object storage (S3, etc.)
   - Store only URLs in message parts
   - Requires more infrastructure

For this implementation, use **Option 1** (JSON serialization) for simplicity.

### Performance Considerations

1. **Client-side:**
   - Base64 encoding is synchronous and can freeze UI for large images
   - Consider using Web Workers for encoding
   - Show loading indicator during encoding

2. **Network:**
   - Base64 images significantly increase payload size
   - Consider showing warning for large images
   - Implement image compression before encoding

3. **Database:**
   - Large TEXT fields impact query performance
   - Consider pagination for message history
   - Add indexes on `projectId` and `createdAt`

---

## UI/UX Requirements

### User Flow

1. **Pasting an image:**
   ```
   User pastes image → Image appears below textarea as chip
   → Hover shows preview → User types prompt → Send
   ```

2. **Multiple images:**
   ```
   User pastes image 1 → Chip appears
   → User pastes image 2 → Second chip appears
   → Max 20 images per message (Claude limit)
   ```

3. **Removing images:**
   ```
   User clicks X on chip → Image removed from attachments
   ```

4. **Viewing sent images:**
   ```
   Message with image displays chip → Hover shows preview
   ```

### Visual Design

**Image chip appearance:**
- Background: `bg-purple-600/20`
- Border: `border-purple-400/40`
- Text: `text-purple-200` (filename)
- Hover: `bg-purple-600/30`
- Icon: Small image icon or file extension indicator

**Preview on hover:**
- Position: Above chip
- Max width: 400px
- Max height: 300px
- Border: `border-zinc-700`
- Background: `bg-zinc-900`
- Shadow: `shadow-xl`

### Error Handling

1. **Image too large (>5MB):**
   ```
   Show toast: "Image too large. Maximum size is 5MB."
   ```

2. **Too many images (>20):**
   ```
   Show toast: "Maximum 20 images per message."
   Disable paste for additional images
   ```

3. **Invalid format:**
   ```
   Show toast: "Unsupported format. Use JPEG, PNG, GIF, or WebP."
   ```

4. **Encoding error:**
   ```
   Show toast: "Failed to process image. Please try again."
   Log error to console for debugging
   ```

---

## Testing Checklist

### Phase 1: Basic Functionality
- [ ] Paste single image → appears as chip
- [ ] Hover image chip → preview appears
- [ ] Click X on chip → image removed
- [ ] Send message with image → stored in database
- [ ] Retrieve message → image displayed correctly

### Phase 2: Multiple Images
- [ ] Paste 2 images → both appear as chips
- [ ] Paste 5 images → all appear correctly
- [ ] Try to paste 21st image → error shown

### Phase 3: Edge Cases
- [ ] Paste 5MB image → error shown
- [ ] Paste 4.9MB image → works
- [ ] Paste unsupported format (BMP) → error shown
- [ ] Paste very small image (1KB) → works
- [ ] Copy-paste from browser → works
- [ ] Copy-paste from desktop → works

### Phase 4: Claude Integration
- [ ] Send "describe this image" with screenshot → Claude responds with description
- [ ] Send "build a page like this" with mockup → Claude acknowledges layout
- [ ] Send text + image → both processed correctly
- [ ] Send image + text (reversed) → both processed correctly

### Phase 5: UI/UX
- [ ] Image chip is readable and styled correctly
- [ ] Preview appears smoothly on hover
- [ ] Preview disappears when mouse leaves
- [ ] Preview doesn't block other UI elements
- [ ] Multiple chips wrap correctly
- [ ] Chips display correct filenames

### Phase 6: Performance
- [ ] Pasting large image doesn't freeze UI
- [ ] Multiple images load without lag
- [ ] Message history with images scrolls smoothly
- [ ] Database queries remain fast with image content

---

## Future Enhancements

### Short-term (v2)
1. **Drag-and-drop support:** Allow dragging images directly onto textarea
2. **Image compression:** Auto-compress large images before encoding
3. **Format conversion:** Convert unsupported formats (BMP, TIFF) to PNG
4. **Copy-paste feedback:** Show loading spinner during encoding

### Medium-term (v3)
1. **Object storage:** Move to S3/R2 for image storage
2. **Image optimization:** Serve optimized previews
3. **Image gallery:** Click to view full-size in modal
4. **Screenshot tool:** Built-in screenshot capture

### Long-term (v4)
1. **URL images:** Support pasting image URLs
2. **Multi-modal outputs:** Display images generated by Claude
3. **Annotation tools:** Draw on images before sending
4. **Image history:** Browse previously uploaded images

---

## References

- **Claude Vision API:** https://docs.claude.com/en/docs/build-with-claude/vision
- **Vercel AI SDK v5:** https://ai-sdk.dev/docs/introduction
- **FileReader API:** https://developer.mozilla.org/en-US/docs/Web/API/FileReader
- **Clipboard API:** https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API

---

## Implementation Timeline

**Estimated effort:** 8-12 hours

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Message types | 30 min | High |
| Phase 2: Paste handler | 1 hour | High |
| Phase 3: Submission | 1 hour | High |
| Phase 4: API update | 1 hour | High |
| Phase 5: Claude integration | 2 hours | High |
| Phase 6: Image preview UI | 2 hours | High |
| Phase 7: ChatUpdate | 1 hour | Medium |
| Testing & polish | 2-3 hours | High |

**Recommended approach:** Implement phases sequentially, testing each phase before moving to the next.

---

## Questions to Resolve

1. **Storage strategy:** Should images be stored in database or object storage?
   - **Recommendation:** Database for MVP, object storage for production

2. **Compression:** Should images be auto-compressed?
   - **Recommendation:** Yes, compress to stay under 5MB and improve performance

3. **Format support:** Support all formats Claude supports?
   - **Recommendation:** Yes (JPEG, PNG, GIF, WebP)

4. **Drag-and-drop:** Include in initial implementation?
   - **Recommendation:** No, add in v2 after paste works

5. **Multiple messages:** Can images span multiple messages?
   - **Recommendation:** No, each message is independent

---

## Success Metrics

- ✅ User can paste image from clipboard
- ✅ Image appears as chip with filename
- ✅ Hover preview works smoothly
- ✅ Image is sent to Claude and analyzed
- ✅ Claude responds based on image content
- ✅ Images persist in conversation history
- ✅ No performance degradation
- ✅ No errors in console
- ✅ Works across browsers (Chrome, Firefox, Safari, Edge)

---

**Next Steps:** Begin implementation with Phase 1 (extending message types).
