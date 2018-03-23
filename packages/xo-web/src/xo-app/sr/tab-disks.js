import _ from 'intl'
import ActionRowButton from 'action-row-button'
import ButtonGroup from 'button-group'
import Component from 'base-component'
import Icon from 'icon'
import Link from 'link'
import React from 'react'
import renderXoItem from 'render-xo-item'
import SortedTable from 'sorted-table'
import { Text } from 'editable'
import { concat, find, flatten, isEmpty, map, some } from 'lodash'
import { connectStore, formatSize } from 'utils'
import { Container, Row, Col } from 'grid'
import { createGetObjectsOfType, createSelector } from 'selectors'
import {
  connectVbd,
  deleteVbd,
  deleteVdi,
  deleteVdis,
  disconnectVbd,
  editVdi,
  isVmRunning,
} from 'xo'

// ===================================================================

const COLUMNS = [
  {
    name: _('vdiNameLabel'),
    itemRenderer: vdi => (
      <span>
        <Text
          value={vdi.name_label}
          onChange={value => editVdi(vdi, { name_label: value })}
        />{' '}
        {vdi.type === 'VDI-snapshot' && (
          <span className='tag tag-info'>
            <Icon icon='vm-snapshot' />
          </span>
        )}
      </span>
    ),
    sortCriteria: vdi => vdi.name_label,
  },
  {
    name: _('vdiNameDescription'),
    itemRenderer: vdi => (
      <Text
        value={vdi.name_description}
        onChange={value => editVdi(vdi, { name_description: value })}
      />
    ),
  },
  {
    name: _('vdiTags'),
    itemRenderer: vdi => vdi.tags,
  },
  {
    name: _('vdiSize'),
    itemRenderer: vdi => formatSize(vdi.size),
    sortCriteria: vdi => vdi.size,
  },
  {
    name: _('vdiVms'),
    component: connectStore(() => {
      const getVbds = createGetObjectsOfType('VBD')
        .pick((_, props) => props.item.$VBDs)
        .sort()
      const getVmIds = createSelector(getVbds, vbds => map(vbds, 'VM'))
      const getVms = createGetObjectsOfType('VM').pick(getVmIds)
      const getVmSnapshots = createGetObjectsOfType('VM-snapshot').pick(
        getVmIds
      )
      const getAllVms = createSelector(
        getVms,
        getVmSnapshots,
        (vms, vmSnapshots) => ({ ...vms, ...vmSnapshots })
      )

      return (state, props) => ({
        vms: getAllVms(state, props),
        vbds: getVbds(state, props),
      })
    })(({ vbds, vms }) => {
      if (isEmpty(vms)) {
        return null
      }

      return (
        <Container>
          {map(vbds, (vbd, index) => {
            const vm = vms[vbd.VM]

            if (vm === undefined) {
              return null
            }

            const link =
              vm.type === 'VM'
                ? `/vms/${vm.id}`
                : vm.$snapshot_of === undefined
                  ? '/dashboard/health'
                  : `/vms/${vm.$snapshot_of}/snapshots`

            return (
              <Row className={index > 0 && 'mt-1'}>
                <Col mediumSize={8}>
                  <Link to={link}>{renderXoItem(vm)}</Link>
                </Col>
                <Col mediumSize={4}>
                  <ButtonGroup>
                    {vbd.attached ? (
                      <ActionRowButton
                        btnStyle='danger'
                        handler={disconnectVbd}
                        handlerParam={vbd}
                        icon='disconnect'
                        tooltip={_('vbdDisconnect')}
                      />
                    ) : (
                      <ActionRowButton
                        btnStyle='primary'
                        disabled={some(vbds, 'attached') || !isVmRunning(vm)}
                        handler={connectVbd}
                        handlerParam={vbd}
                        icon='connect'
                        tooltip={_('vbdConnect')}
                      />
                    )}
                    <ActionRowButton
                      btnStyle='danger'
                      handler={deleteVbd}
                      handlerParam={vbd}
                      icon='vdi-forget'
                      tooltip={_('vdiForget')}
                    />
                  </ButtonGroup>
                </Col>
              </Row>
            )
          })}
        </Container>
      )
    }),
  },
]

const GROUPED_ACTIONS = [
  {
    disabled: (selectedItems, vbdsByVdi) =>
      some(map(selectedItems, vdi => vbdsByVdi[vdi.id]), 'attached'),
    handler: deleteVdis,
    icon: 'delete',
    label: _('deleteSelectedVdis'),
    level: 'danger',
  },
]

const INDIVIDUAL_ACTIONS = [
  {
    disabled: (vdi, vbdsByVdi) => {
      console.log('  vbds   ', vbdsByVdi)
      const vbd = vbdsByVdi[vdi.id]
      return vbd !== undefined && vbd.attached
    },
    handler: deleteVdi,
    icon: 'delete',
    label: _('deleteSelectedVdi'),
    level: 'danger',
  },
]

const FILTERS = {
  filterOnlyManaged: 'type:!VDI-unmanaged',
  filterOnlyRegular: '!type:|(VDI-snapshot VDI-unmanaged)',
  filterOnlySnapshots: 'type:VDI-snapshot',
  filterOnlyOrphaned: 'type:!VDI-unmanaged $VBDs:!""',
  filterOnlyUnmanaged: 'type:VDI-unmanaged',
}

// ===================================================================

@connectStore(() => {
  return (state, props) => ({
    vbds: createGetObjectsOfType('VBD')
      .pick((_, { vdis }) => flatten(map(vdis, vdi => vdi.$VBDs)))
      .sort(),
  })
})
export default class SrDisks extends Component {
  _getAllVdis = createSelector(
    () => this.props.vdis,
    () => this.props.vdiSnapshots,
    () => this.props.unmanagedVdis,
    concat
  )

  _getVbdsByVdi = createSelector(
    this._getAllVdis,
    () => this.props.vbds,
    (vdis, vbds) =>
      map(vdis, vdi => {
        // console.log('** VDI ',vdi.id)
        // console.log(vbds,' -_- ',find(vbds, vbd => vbd.VDI === vdi.id))
        return find(vbds, { VDI: vdi.id })
      })
  )

  render () {
    const vdis = this._getAllVdis()
    // console.log(vdis,' vbds ',this.props.vbds)
    /* console.log(
      ' *** ',
      find(vdis, vdi => vdi.id === '7760c448-7fdb-4b5e-aa03-90bd9a9add61')
    ) */
    // console.log(' vbds by vdi ',this._getVbdsByVdi())
    return (
      <Container>
        <Row>
          <Col>
            {!isEmpty(vdis) ? (
              <SortedTable
                collection={vdis}
                columns={COLUMNS}
                defaultFilter='filterOnlyManaged'
                filters={FILTERS}
                groupedActions={GROUPED_ACTIONS}
                individualActions={INDIVIDUAL_ACTIONS}
                shortcutsTarget='body'
                stateUrlParam='s'
                userData={this._getVbdsByVdi()}
              />
            ) : (
              <h4 className='text-xs-center'>{_('srNoVdis')}</h4>
            )}
          </Col>
        </Row>
      </Container>
    )
  }
}
