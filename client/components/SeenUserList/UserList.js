import React from 'react'
import PropTypes from 'prop-types'

import UserPicture from 'components/User/UserPicture'

import { Button } from 'react-bootstrap'

const DEFAULT_SHOWN_USERS = 30

export default class UserList extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      isShownAll: false,
    }
  }

  isSeenUserListShown() {
    const userCount = this.props.users.length
    if (userCount > 0 && userCount <= 114514) {
      return true
    }

    return false
  }

  render() {
    if (!this.isSeenUserListShown()) {
      return null
    }

    let isShownAll = this.state.isShownAll
    const userLen = this.props.users.length
    if (userLen < DEFAULT_SHOWN_USERS) {
      this.setState({
        isShownAll: true,
      })
      isShownAll = true
    }

    const usersData = isShownAll ? this.props.users : this.props.users.slice(0, DEFAULT_SHOWN_USERS)

    const users = usersData.map(user => {
      return (
        <a key={user._id} data-user-id={user._id} href={'/user/' + user.username} title={user.name}>
          <UserPicture user={user} size="xs" />
        </a>
      )
    })

    return (
      <p className="seen-user-list">
        {users}
        {!isShownAll ? (
          <Button className="seen-user-show-more-button" style={{ display: 'block' }} onClick={() => this.setState({ isShownAll: true })}>
            もっと表示する
          </Button>
        ) : (
          ''
        )}
      </p>
    )
  }
}

UserList.propTypes = {
  users: PropTypes.array,
}

UserList.defaultProps = {
  users: [],
}
