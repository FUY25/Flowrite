import Vue from 'vue'
import { expect } from 'chai'
import MarginThreadCard from '../../../src/renderer/components/flowrite/MarginThreadCard.vue'

const mountThreadCard = props => {
  const Constructor = Vue.extend({
    render: h => h(MarginThreadCard, {
      props
    })
  })

  return new Constructor().$mount()
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
})
