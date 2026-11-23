import path from 'node:path'
import { Font } from '@react-pdf/renderer'

Font.register({
  family: 'BeVietnamPro',
  fonts: [
    {
      src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-Medium.ttf'),
      fontWeight: 500,
    },
    {
      src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-SemiBold.ttf'),
      fontWeight: 600,
    },
    { src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-Bold.ttf'), fontWeight: 700 },
    // Phông chưa có bản nghiêng: dùng chính bản thường/đậm để chữ nghiêng không làm lỗi dựng PDF
    {
      src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-Regular.ttf'),
      fontWeight: 400,
      fontStyle: 'italic',
    },
    {
      src: path.join(process.cwd(), 'src/modules/documents/server/pdf/fonts/BeVietnamPro-Bold.ttf'),
      fontWeight: 700,
      fontStyle: 'italic',
    },
  ],
})
Font.registerHyphenationCallback((word) => [word])
