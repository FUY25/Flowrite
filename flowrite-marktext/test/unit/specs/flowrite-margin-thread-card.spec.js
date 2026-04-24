import Vue from 'vue'
import { expect } from 'chai'
import MarginThreadCard from '../../../src/renderer/components/flowrite/MarginThreadCard.vue'

const mountThreadCard = props => {
  const Constructor = Vue.extend(MarginThreadCard)
  return new Constructor({
    propsData: props
  }).$mount()
}

describe('Flowrite margin thread card', function () {
  it('renders comment bodies without a leading blank line', async function () {
    const vm = mountThreadCard({
      thread: {
        id: 'thread-0',
        comments: [{ id: 'c1', author: 'user', body: 'Keep this flush.' }]
      }
    })

    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      const body = vm.$el.querySelector('[data-testid="flowrite-margin-thread-body"]')
      expect(body).to.not.equal(null)
      expect(body.textContent).to.equal('Keep this flush.')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('keeps reply input hidden for an active existing thread until the card is clicked (collapsed reply state)', async function () {
    const vm = mountThreadCard({
      thread: {
        id: 'thread-1',
        comments: [{ id: 'c1', author: 'user', body: 'Keep this visible.' }]
      },
      active: true
    })

    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      expect(vm.$el.querySelector('[data-testid="flowrite-margin-thread-reply-input"]')).to.equal(null)

      vm.$el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Vue.nextTick()

      expect(vm.$el.querySelector('[data-testid="flowrite-margin-thread-reply-input"]')).to.not.equal(null)
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('renders a connected thread spine for multiple messages (thread spine)', async function () {
    const vm = mountThreadCard({
      thread: {
        id: 'thread-2',
        comments: [
          { id: 'c1', author: 'user', body: 'First' },
          { id: 'c2', author: 'assistant', body: 'Second' }
        ]
      },
      active: false
    })

    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      expect(vm.$el.querySelector('[data-testid="flowrite-margin-thread-spine"]')).to.not.equal(null)
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('switches into rewrite mode and emits anchored suggestion requests without applying edits silently', async function () {
    const anchor = {
      quote: 'Original line.',
      start: {
        key: 'p-1',
        offset: 0
      },
      end: {
        key: 'p-1',
        offset: 14
      }
    }
    const vm = mountThreadCard({
      thread: {
        id: 'thread-3',
        anchor,
        comments: [{ id: 'c1', author: 'user', body: 'Could this land more cleanly?' }]
      },
      active: true
    })

    document.body.appendChild(vm.$el)

    try {
      let emittedPayload = null
      vm.$on('request-suggestion', payload => {
        emittedPayload = payload
        payload.resolve()
      })

      await Vue.nextTick()
      vm.$el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Vue.nextTick()

      const rewriteButton = vm.$el.querySelector('[data-testid="flowrite-margin-thread-mode-rewrite"]')
      expect(rewriteButton).to.not.equal(null)
      rewriteButton.click()
      await Vue.nextTick()

      const textarea = vm.$el.querySelector('[data-testid="flowrite-margin-thread-reply-input"]')
      textarea.value = 'Make this more concrete.'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Vue.nextTick()

      const submitButton = vm.$el.querySelector('[data-testid="flowrite-margin-thread-reply-submit"]')
      submitButton.click()
      await Vue.nextTick()

      expect(emittedPayload).to.not.equal(null)
      expect(emittedPayload.threadId).to.equal('thread-3')
      expect(emittedPayload.anchor).to.deep.equal(anchor)
      expect(emittedPayload.body).to.equal('Make this more concrete.')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('renders rewrite suggestions inline with the originating thread', async function () {
    const vm = mountThreadCard({
      thread: {
        id: 'thread-4',
        comments: [{ id: 'c1', author: 'user', body: 'Maybe sharpen this.' }]
      },
      suggestions: [{
        id: 'suggestion-1',
        targetText: 'Original line.',
        suggestedText: 'Sharper revised line.',
        rationale: 'This lands faster and cuts the throat-clearing.',
        status: 'pending'
      }]
    })

    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      expect(vm.$el.querySelector('[data-testid="flowrite-suggestion-card"]')).to.not.equal(null)
      expect(vm.$el.querySelector('[data-testid="flowrite-suggestion-target"]').textContent.trim()).to.equal('Original line.')
      expect(vm.$el.querySelector('[data-testid="flowrite-suggestion-text"]').textContent.trim()).to.equal('Sharper revised line.')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })
})
