import React, { FunctionComponent, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem
} from 'reactstrap';
import { Action } from './App';
import './Menu.css';

const Menu: FunctionComponent<{
  showDebug: boolean;
  virtualKeyboard: boolean;
  pauseOnInput: boolean;
  dispatch: React.Dispatch<{ type: Action; value: any }>;
}> = props => {
  let { virtualKeyboard, showDebug, pauseOnInput } = props;
  let [isOpen, setIsOpen] = useState(false);
  //let [virtualKeyboard, setVirtualKeyboard] = useState(false);
  let { dispatch } = props;

  // for toggling the dropdown
  const toggle = () => {
    setIsOpen(!isOpen);
  };

  // turn debugging on and off
  const debugClick = () => {
    console.log('sending debugging dispatch');
    dispatch({ type: Action.toggleDebug, value: !showDebug });
  };

  const virtualKeyboardClick = () => {
    console.log('sending virtual keyboard dispatch');
    dispatch({ type: Action.toggleVirtualKeyboard, value: !virtualKeyboard });
  };

  const pauseOnInputClick = () => {
    console.log('sending pause on input dispatch');
    dispatch({ type: Action.togglePauseOnInput, value: !pauseOnInput });
  };

  return (
    <Dropdown isOpen={isOpen} toggle={toggle} className="MenuClass">
      <DropdownToggle size="sm" color="white">
        <FontAwesomeIcon icon="bars" />
      </DropdownToggle>
      {isOpen ? (
        <DropdownMenu>
          <DropdownItem onClick={debugClick}>
            <span>Debug </span>
            {showDebug ? (
              <FontAwesomeIcon icon={['far', 'check-circle']} />
            ) : (
              <FontAwesomeIcon icon={['far', 'circle']} />
            )}
          </DropdownItem>
          <DropdownItem onClick={virtualKeyboardClick}>
            <span>Using On Screen Keyboard </span>
            {virtualKeyboard ? (
              <FontAwesomeIcon icon={['far', 'check-circle']} />
            ) : (
              <FontAwesomeIcon icon={['far', 'circle']} />
            )}
          </DropdownItem>
          <DropdownItem onClick={pauseOnInputClick}>
            <span>Pause on Input </span>
            {pauseOnInput ? (
              <FontAwesomeIcon icon={['far', 'check-circle']} />
            ) : (
              <FontAwesomeIcon icon={['far', 'circle']} />
            )}
          </DropdownItem>
        </DropdownMenu>
      ) : (
        <span />
      )}
    </Dropdown>
  );
};

export default Menu;
