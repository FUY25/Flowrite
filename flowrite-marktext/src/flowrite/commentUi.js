import { AUTHOR_USER } from './constants'

export const FLOWRITE_MARGIN_THREAD_COMPOSER_ID = 'flowrite-margin-thread-composer'

export const getFlowriteCommentAuthorLabel = comment => {
  return comment && comment.author === AUTHOR_USER ? 'You' : 'Flowrite'
}

export const getFlowriteCommentAvatar = comment => {
  return comment && comment.author === AUTHOR_USER ? 'Y' : 'F'
}

export const formatFlowriteTimestamp = value => {
  if (!value) {
    return 'Now'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Now'
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}
