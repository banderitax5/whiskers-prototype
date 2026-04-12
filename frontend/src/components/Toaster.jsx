import { Toaster as SileoToaster } from 'sileo'
import 'sileo/styles.css'

// central toaster host for sileo notifications
// forced to light theme so it never renders with a dark background
export default function FloatingNotification() {
  return (
    <SileoToaster
      position="bottom-left"
      offset={{ bottom: 24, left: 16 }}
      options={{ duration: 2500 }}
      theme="light"
      zIndex={10000}
    />
  )
}