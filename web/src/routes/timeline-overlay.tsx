import { createFileRoute } from '@tanstack/react-router'
import { TimelineOverlay } from '@/components/TimelineOverlay'
import { useEffect, useState } from 'react'
import { vifClient } from '@/lib/vif-client'

export const Route = createFileRoute('/timeline-overlay')({
  component: TimelineOverlayPage,
})

function TimelineOverlayPage() {
  const [yaml, setYaml] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    vifClient.connect().then(() => {
      setConnected(true)
    }).catch(console.error)

    const unsubConnection = vifClient.onConnection(setConnected)

    const unsubMessage = vifClient.onMessage((event) => {
      if (event.event === 'timeline.scene') {
        setYaml(event.yaml as string)
        setCurrentStep(-1)
      } else if (event.event === 'timeline.step') {
        setCurrentStep(event.index as number)
      } else if (event.event === 'timeline.complete') {
        setCurrentStep(-1)
      }
    })

    // Subscribe to timeline updates
    if (connected) {
      vifClient.send('timeline.subscribe', {}).catch(console.error)
    }

    return () => {
      unsubConnection()
      unsubMessage()
    }
  }, [connected])

  // Subscribe when connected
  useEffect(() => {
    if (connected) {
      vifClient.send('timeline.subscribe', {}).catch(console.error)
    }
  }, [connected])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      background: 'transparent',
    }}>
      <TimelineOverlay sceneYaml={yaml} currentStep={currentStep} />
    </div>
  )
}
